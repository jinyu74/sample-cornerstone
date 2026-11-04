export type SessionCheck =
  | { status: "ok"; userId: string }
  | { status: "unauthenticated" }
  | { status: "error" };
