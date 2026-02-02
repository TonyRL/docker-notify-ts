import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { DockerAPI } from '../src/dockerApi';

vi.mock('got', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
    },
}));

import got from 'got';

describe('DockerAPI', () => {
    let dockerAPI: DockerAPI;
    const mockGotGet = vi.mocked(got.get);
    const mockGotPost = vi.mocked(got.post);

    beforeEach(() => {
        dockerAPI = new DockerAPI();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('getToken', () => {
        it('should obtain token from Docker Hub', async () => {
            const mockToken = 'test-token-123';
            mockGotPost.mockReturnValue({
                json: vi.fn().mockResolvedValue({ token: mockToken }),
            } as unknown as ReturnType<typeof got.post>);

            const token = await dockerAPI.getToken('testuser', 'testpass');

            expect(token).toBe(mockToken);
            expect(mockGotPost).toHaveBeenCalledWith('https://hub.docker.com/v2/users/login', {
                json: {
                    username: 'testuser',
                    password: 'testpass',
                },
            });
        });

        it('should lowercase username', async () => {
            mockGotPost.mockReturnValue({
                json: vi.fn().mockResolvedValue({ token: 'token' }),
            } as unknown as ReturnType<typeof got.post>);

            await dockerAPI.getToken('TestUser', 'pass');

            expect(mockGotPost).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    json: expect.objectContaining({ username: 'testuser' }),
                })
            );
        });
    });

    describe('getRepository', () => {
        it('should fetch repository info', async () => {
            const mockRepo = {
                user: 'library',
                name: 'nginx',
                last_updated: '2024-01-01T00:00:00Z',
            };
            mockGotGet.mockReturnValue({
                json: vi.fn().mockResolvedValue(mockRepo),
            } as unknown as ReturnType<typeof got.get>);

            const repo = await dockerAPI.getRepository('library', 'nginx');

            expect(repo).toEqual(mockRepo);
            expect(mockGotGet).toHaveBeenCalledWith('https://hub.docker.com/v2/repositories/library/nginx', {
                headers: {},
            });
        });

        it('should include auth header when token provided', async () => {
            mockGotGet.mockReturnValue({
                json: vi.fn().mockResolvedValue({}),
            } as unknown as ReturnType<typeof got.get>);

            await dockerAPI.getRepository('library', 'nginx', 'my-token');

            expect(mockGotGet).toHaveBeenCalledWith(expect.any(String), {
                headers: { Authorization: 'Bearer my-token' },
            });
        });
    });

    describe('getTags', () => {
        it('should fetch all tags with pagination', async () => {
            const firstPage = {
                count: 150,
                results: Array(100).fill({
                    name: 'tag',
                    last_updated: '2024-01-01',
                }),
            };
            const secondPage = {
                count: 150,
                results: Array(50).fill({
                    name: 'tag2',
                    last_updated: '2024-01-02',
                }),
            };

            mockGotGet
                .mockReturnValueOnce({
                    json: vi.fn().mockResolvedValue(firstPage),
                } as unknown as ReturnType<typeof got.get>)
                .mockReturnValueOnce({
                    json: vi.fn().mockResolvedValue(secondPage),
                } as unknown as ReturnType<typeof got.get>);

            const tags = await dockerAPI.getTags('library', 'nginx');

            expect(tags).toHaveLength(150);
            expect(mockGotGet).toHaveBeenCalledTimes(2);
        });

        it('should handle single page of results', async () => {
            const singlePage = {
                count: 5,
                results: [
                    { name: 'latest', last_updated: '2024-01-01' },
                    { name: 'v1.0', last_updated: '2024-01-01' },
                ],
            };
            mockGotGet.mockReturnValue({
                json: vi.fn().mockResolvedValue(singlePage),
            } as unknown as ReturnType<typeof got.get>);

            const tags = await dockerAPI.getTags('library', 'nginx');

            expect(tags).toHaveLength(2);
            expect(mockGotGet).toHaveBeenCalledTimes(1);
        });
    });
});
