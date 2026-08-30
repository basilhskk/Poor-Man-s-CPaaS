import { Router } from "express";
import type { RequestHandler } from "express";

export function createAuthRouter(
  ctrl: {
    register: RequestHandler;
    login: RequestHandler;
    logout: RequestHandler;
    me: RequestHandler;
  },
  jwtMw: RequestHandler,
): Router {
  const router = Router();
  router.post("/register", ctrl.register);
  router.post("/login", ctrl.login);
  router.post("/logout", ctrl.logout);
  router.get("/me", jwtMw, ctrl.me);
  return router;
}
