export type RouteHandlerContext = {
  params?: Promise<Record<string, string>>;
  [key: string]: unknown;
};

export type PlainHandler = (
  req: Request,
  context?: RouteHandlerContext
) => Promise<Response>;
