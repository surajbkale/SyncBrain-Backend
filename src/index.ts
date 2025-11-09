import express from "express";
import jwt from "jsonwebtoken";
import z, { hash } from "zod";
import bcrypt from "bcrypt";
import { UserModel, ContentModel, LinkModel } from "./db";
import auth from "./middleware";
import { random } from "./utils";
import mongoose from "mongoose";
import cors from "cors";

import dotenv from "dotenv";
dotenv.config();
const port = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use(cors());

const db_connect = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL as string);
    console.log(`Connected to db`);
  } catch (error) {
    console.log(`Error connecting to db`);
    process.exit(1);
  }
};

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
      .regex(/[!@#$%^&*(),.?":{}|<>]/, {
        message: "password must contain atleast one special character",
      }),
  });

  const validInput = inputzod.safeParse(req.body);
  if (!validInput.success) {
    const errorMessage = validInput.error;
    res.status(411).json({
      message: errorMessage || "Invalid format",
      error: errorMessage,
    });
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
    } else {
      res.status(500).json({
        message: "User name is taken",
      });
      return;
    }
    res.status(200).json({
      message: "User Created Successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: "internal server error",
    });
  }
});

app.post("/api/v1/signin", async (req, res) => {
  const { username, password } = req.body;

  const user = await UserModel.findOne({ username });

  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  if (user === null) {
    res.status(401).json({ message: "Invalid Credentials" });
    return;
  }

  if (user.password) {
    try {
      const hashedPassword = await bcrypt.compare(password, user.password);
      if (hashedPassword) {
        if (user._id) {
          const token = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET as string,
            { expiresIn: "7days" }
          );
          res.status(200).json({
            message: "User logged in successfully",
            token,
            username,
          });
        }
      } else {
        res.status(401).json({ message: "Invalid Credentials" });
      }
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  } else {
    res.status(401).json({ message: "Invalid Credentails" });
  }
});

// function generateGuestToken() {
//   return jwt.sign(
//     { role: "guest", userId: `guest_${Date.now()}` },
//     process.env.JWT_SECRET as string,
//     { expiresIn: "1h" }
//   );
// }

// app.post("/api/v1/guest", async (req, res) => {
//   try {
//     const token = generateGuestToken();
//     res.json({ token, username: "Guest" });
//   } catch (error) {
//     res.status(500).json({
//       message: "Guest login failed",
//     });
//   }
// });

app.post("/api/v1/content", auth, async (req, res) => {
  const { link, title, type, content } = req.body;
  try {
    await ContentModel.create({
      title: title,
      link: link,
      type: type,
      content: content,
      tag: [],
      userId: req.userId,
    });

    res.status(200).json({
      message: "Content added successfully",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Internal Server error",
    });
  }
});

app.get("/api/v1/content", auth, async (req, res) => {
  const userId = req.userId;
  try {
    const content = await ContentModel.find({
      userId: userId,
    }).populate("userId", "username");

    res.status(200).json({ content });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server error",
    });
  }
});

app.delete("/api/v1/content/:contentId", auth, async (req, res) => {
  const { contentId } = req.params;

  if (!contentId || !mongoose.Types.ObjectId.isValid(contentId)) {
    res.status(400).json({
      error: "Invalid or missing content ID",
    });
    return;
  }

  await ContentModel.deleteOne({
    _id: contentId,
    userId: req.userId,
  });

  res.json({ message: "Content deleted successfully" });
});

app.post("/api/v1/brain/share", auth, async (req, res) => {
  const share = req.body.share;
  if (share) {
    const content = await LinkModel.findOne({
      userId: req.userId,
    });

    if (content) {
      res.json({
        hash: content.hash,
      });
      return;
    }

    const hash = random(10);
    await LinkModel.create({
      userId: req.userId,
      hash: hash,
    });

    res.json({
      hash,
    });
  } else {
    await LinkModel.deleteOne({
      userId: req.userId,
    });

    res.json({
      message: "Removed Link",
    });
  }
});

app.get("/api/v1/brain/:shareLink", async (req, res) => {
  const hash = req.params.shareLink;

  const link = await LinkModel.findOne({
    hash,
  });

  if (!link) {
    res.status(411).json({
      message: "Sorry incorrect input",
    });
    return;
  }

  const content = await ContentModel.find({
    userId: link.userId,
  });

  console.log(link);
  const user = await UserModel.findOne({
    _id: link.userId,
  });

  if (!user) {
    res.status(411).json({
      message: "User not found, error should ideally not happen",
    });
    return;
  }

  res.json({
    username: user.username,
    content: content,
  });
});

db_connect();
app.listen(3000);
