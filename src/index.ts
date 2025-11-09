import express from "express";
import jwt from "jsonwebtoken";
import z from "zod";
import bcrypt from "bcrypt";
import { UserModel } from "./db";

const app = express();

app.post("/api/v1/signup", async (req, res) => {
  const inputzod = z.object({
    username: z
      .string()
      .min(3, { message: "username must be atleast 3 characters long" })
      .max(16, "username must be atmost 16 characters long"),
    password: z
      .string()
      .min(8, { message: "password must be at least 8 characters" })
      .max(16, { message: "password must be atmost 16 characters long" })
      .regex(/\W/, {
        message: "password must contain atleast one special character",
      }),
  });

  const validInput = inputzod.safeParse(req.body);

  if (!validInput.success) {
    const errorMessage = validInput.error.message;
    res.status(411).json({ message: "invalid format", error: errorMessage });
    return;
  }

  const { username, password } = validInput.data;
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const user = await UserModel.findOne({ username });
    if (!user) {
      await UserModel.create({
        username,
        password: hashedPassword,
      });
      res.status(200).json({
        message: "User Created Successfully",
      });
    }
  } catch (error) {
    res.status(500).json({
      message: "internal server error",
    });
  }
});

app.post("/api/v1/signin", (req, res) => {});
app.post("/api/v1/content", (req, res) => {});
app.get("/api/v1/content", (req, res) => {});
app.delete("/api/v1/content", (req, res) => {});
app.get("/api/v1/brain/:shareLink", (req, res) => {});
app.post("/api/v1/brain/share", (req, res) => {});

app.listen(3000);
