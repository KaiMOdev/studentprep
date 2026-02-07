// Shared Hono env type for authenticated routes
export type AuthEnv = {
  Variables: {
    userId: string;
    userEmail: string;
  };
};
