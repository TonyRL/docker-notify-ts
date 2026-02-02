import got from 'got';

import { logger } from './logger';

const DOCKER_HUB_BASE_URL = 'https://hub.docker.com';
const PAGE_SIZE = 100;

interface TokenResponse {
    token: string;
}

interface RepositoryInfo {
    user: string;
    name: string;
    last_updated: string;
    [key: string]: unknown;
}

interface TagInfo {
    name: string;
    last_updated: string;
    [key: string]: unknown;
}

interface TagsResponse {
    count: number;
    results: TagInfo[];
    next: string | null;
    previous: string | null;
}

export class DockerAPI {
    private baseUrl: string;

    constructor(baseUrl: string = DOCKER_HUB_BASE_URL) {
        this.baseUrl = baseUrl;
    }

    async getToken(username: string, password: string): Promise<string> {
        const url = `${this.baseUrl}/v2/users/login`;

        try {
            const response = await got
                .post(url, {
                    json: {
                        username: username.toLowerCase(),
                        password,
                    },
                })
                .json<TokenResponse>();

            return response.token;
        } catch (error) {
            logger.error({ error }, 'Failed to obtain Docker Hub token');
            throw error;
        }
    }

    async getRepository(user: string, name: string, token?: string): Promise<RepositoryInfo> {
        const url = `${this.baseUrl}/v2/repositories/${user.toLowerCase()}/${name}`;

        return this.makeRequest<RepositoryInfo>(url, token);
    }

    async getTags(user: string, name: string, token?: string): Promise<TagInfo[]> {
        const path = `/v2/repositories/${user.toLowerCase()}/${name}/tags`;
        return this.requestAllPages(path, token);
    }

    private async requestAllPages(path: string, token?: string): Promise<TagInfo[]> {
        const firstPageResult = await this.makeRequest<TagsResponse>(
            `${this.baseUrl}${path}?page_size=${PAGE_SIZE}&page=1`,
            token
        );

        const totalCount = firstPageResult.count;
        const maxPage = Math.ceil(totalCount / PAGE_SIZE);

        if (maxPage <= 1) {
            return firstPageResult.results;
        }

        const promises: Promise<TagsResponse>[] = [];
        for (let page = 2; page <= maxPage; page++) {
            promises.push(
                this.makeRequest<TagsResponse>(`${this.baseUrl}${path}?page_size=${PAGE_SIZE}&page=${page}`, token)
            );
        }

        const subsequentResults = await Promise.all(promises);
        const allResults = [firstPageResult, ...subsequentResults];

        return allResults.flatMap((result) => result.results);
    }

    private async makeRequest<T>(url: string, token?: string): Promise<T> {
        const headers: Record<string, string> = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            return await got
                .get(url, {
                    headers,
                })
                .json<T>();
        } catch (error) {
            logger.error({ error, url }, 'Docker Hub API request failed');
            throw error;
        }
    }
}

export const dockerAPI = new DockerAPI();
