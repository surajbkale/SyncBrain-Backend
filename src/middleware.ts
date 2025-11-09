import jwt, { JwtPayload } from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

const auth = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers["authorization"];
  const decodedToken = jwt.verify(
    token as string,
    process.env.JWT_SECRET as string
  ) as JwtPayload;

  if (decodedToken) {
    req.userId = decodedToken.id;
    next();
  } else {
    res.status(403).json({ warning: "You are not logged in" });
  }
};

export default auth;
