import express, { Request, Response } from "express";
import cors from "cors";
import mongoose from "mongoose";
import { Index, Pinecone } from "@pinecone-database/pinecone";
import { GoogleGenerativeAI } from "@google/generative-ai";
import puppeteer, { Puppeteer } from "puppeteer-core";
import z, { unknown } from "zod";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import dotenv from "dotenv";
import { ContentModel, LinkModel, UserModel } from "./db";
import auth from "./middleware";
import { random } from "./utils";
dotenv.config();

interface User {
  _id: mongoose.Types.ObjectId;
  username: string;
  password: string;
}

interface Content {
  _id: mongoose.Types.ObjectId;
  title: string;
  link?: string;
  type: string;
  content: string;
  tag: string[];
  userId: mongoose.Types.ObjectId;
}

interface Link {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  hash: string;
}

interface AuthRequest extends Request {
  userId?: string;
}

interface SearchQuery {
  query: string;
}

interface ScrapedData {
  title: string;
  content: string;
}

const app = express();

app.use(
  cors({
    origin: ["https://syncbrain.bitalchemy.app", "http://localhost:5173"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

const port = process.env.PORT || 3000;

app.use(express.json());

// Initialize Pinecone client
const initPinecone = async () => {
  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY as string,
  });
  return pinecone.index(process.env.PINECONE_INDEX as string);
};

let pineconeIndex: Index;

// Initialize gemini api
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Function to get embeddings from Gemini
// Update your getEmbedding function
async function getEmbedding(text: string): Promise<number[]> {
  const embeddingModel = genAI.getGenerativeModel({
    model: "embedding-001",
  });
  const result = await embeddingModel.embedContent(text);

  // Try to access the values property if it exists
  if (result.embedding && typeof result.embedding === "object") {
    if (
      "values" in result.embedding &&
      Array.isArray(result.embedding.values)
    ) {
      return result.embedding.values;
    } else if (Array.isArray(result.embedding)) {
      return result.embedding;
    }

    console.error("Unexpected embedding format", result.embedding);
    throw new Error("Failed to get valid embedding");
  }
}

// Function to scrape URL content
async function scrapeUrl(url: string): Promise<ScrapedData> {
  try {
    console.log(`Node environment: ${process.env.NODE_ENV}`);
    console.log(
      `Puppetter package version: ${require("puppeteer/package.json").version}`
    );

    let executablePath;
    if (process.env.PUPPETTER_EXECUTABLE_PATH) {
      executablePath = process.env.PUPPETTER_EXECUTABLE_PATH;
      console.log(`Using chrome at: ${executablePath}`);
    } else {
      executablePath = puppeteer.executablePath();
      console.log(`Using bundled chrome at: ${executablePath}`);
    }
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--diable-dev-shm-usage",
        "--single-process",
        "--no-zygote",
      ],
    });
    const page = await browser.newPage();
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // Extract title and content
    const title = await page.title();
    const content = await page.evaluate(() => {
      // Basic content extraction
      const paragraphs = Array.from(document.querySelectorAll("p")).map(
        (p) => p.textContent
      );
      const headings = Array.from(document.querySelectorAll("h1, h2, h3")).map(
        (h) => h.textContent
      );
      return [...headings, ...paragraphs].filter(Boolean).join(" ").trim();
    });

    await browser.close();
    return { title, content };
  } catch (error) {
    console.error("Error scraping URL: ", error);

    if (error instanceof Error) {
      console.error(error.stack);
    } else {
      console.error("An unknow error occurred", error);
    }
    return {
      title: "Failed to scrape",
      content: `Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
}

const dbConnect = async (): Promise<void> => {
  try {
    await mongoose.connect(process.env.MONGO_URL as string);
    console.log("Connected to MongoDB");

    // Initialize PineCone
    pineconeIndex = await initPinecone();
    console.log("Connected to Pinecone");

    app.listen(port, () => {
      console.log(`Server is running on port: ${port}`);
    });
  } catch (error) {
    console.log("Error connecting to db");
    console.log(error);
    process.exit(1);
  }
};

dbConnect();

app.get("/", (req: Request, res: Response) => {
  res.send("SyncBrain API is running");
});

app.post("/api/v1/signup", async (req: Request, res: Response) => {
  const inputZod = z.object({
    username: z
      .string()
      .min(3, { message: "Username must be at least 3 characters long" })
      .max(16, { message: "Username must be at most 16 characters long" }),
    password: z
      .string()
      .min(8, { message: "Password must be at least 8 character long" })
      .max(16, { message: "Password must be at most 20 characters long" })
      .regex(/[!@#$%^&*(),.?":{}|<>]/, {
        message: "Password must contain at least one special character",
      }),
  });

  const validInput = inputZod.safeParse(req.body);
  if (!validInput.success) {
    const errorMessage = validInput.error.message;
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
      await UserModel.create({ username, password: hashedPassword });
    } else {
      res.status(500).json({
        message: "Username is taken",
      });
    }
    res.status(200).json({
      message: "User creted successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal server error",
    });
  }
});

app.post("/api/v1/signin", async (req: Request, res: Response) => {
  const { username, password } = req.body;

  const user = await UserModel.findOne({ username });

  if (!user) {
    res.status(404).json({
      message: "User not found",
    });
    return;
  }

  if (user === null) {
    res.status(401).json({
      message: "Invalid credentials",
    });
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
        res.status(401).json({
          message: "Invalid credentials",
        });
      }
    } catch (error) {
      res.status(500).json({
        message: "Internal server error",
      });
    }
  } else {
    res.status(401).json({
      message: "Invalid credentials",
    });
  }
});

app.post("/api/v1/content", auth, async (req: AuthRequest, res: Response) => {
  const { link, title, type, content } = req.body;

  try {
    let contentToSave = content;
    let titleToSave = title;

    if (type === "Url" && link) {
      const ScrapedData = await scrapeUrl(link);
      contentToSave = ScrapedData.content;
      if (!titleToSave) titleToSave = ScrapedData.title;
    }

    const newContent = await ContentModel.create({
      title: titleToSave,
      link: link,
      type: type,
      content: contentToSave,
      tag: [],
      userId: req.userId,
    });

    const embedding = await getEmbedding(contentToSave);

    await pineconeIndex.upsert([
      {
        id: newContent._id.toString(),
        values: embedding,
        metadata: {
          userId: req.userId?.toString() ?? "",
          title: titleToSave,
          contentType: type,
          snippet: contentToSave.substring(0, 100),
        },
      },
    ]);

    res.status(200).json({
      message: "Content added successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Internal server error",
    });
  }
});

app.get("/api/v1/content", auth, async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  try {
    const content = await ContentModel.find({ userId: userId }).populate(
      "userId",
      "username"
    );

    if (content.length === 0) {
      res.json({
        content: [
          {
            _id: "default-1",
            type: "Note",
            title: "Welcome to Syncbrain!",
            Content:
              "This is your default content. Start exploring now! click on add memory to add more content",
          },
        ],
      });
      return;
    }
    res.status(200).json({ content });
    return;
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Internal server error",
    });
    return;
  }
});

app.delete(
  "/api/v1/content/:contentId",
  auth,
  async (req: AuthRequest, res: Response) => {
    const { contentId } = req.params;

    if (!contentId || !mongoose.Types.ObjectId.isValid(contentId)) {
      res.status(400).json({ error: "Invalid or missing content ID" });
      return;
    }

    try {
      // Delete from DB
      await ContentModel.deleteOne({
        _id: contentId,
        userId: req.userId,
      });

      // Delete from Pinecone
      await pineconeIndex.deleteOne(contentId);

      res.json({
        message: "Content deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting content", error);
      res.status(500).json({
        message: "Error deleting content",
      });
    }
  }
);

app.post(
  "/api/v1/search",
  auth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { query } = req.body as SearchQuery;
    const userId = req.userId;

    if (!query || query.trim() === "") {
      res.status(400).json({
        message: "Search query is required",
      });
      return;
    }

    try {
      // Get embedding for the query
      const queryEmbedding = await getEmbedding(query);

      // Search in vector database for similar content
      const searchResponse = await pineconeIndex.query({
        vector: queryEmbedding,
        topK: 5,
        includeMetadata: true,
        filter: {
          userId: userId?.toString() || "",
        },
      });

      // Extract relevant content from database based on vector search results
      const contentIds = searchResponse.matches.map((match: any) => match.id);
      const relevantContent = await ContentModel.find({
        _id: { $in: contentIds },
        userId: userId,
      });

      // Map content to include similarity score
      const contentWithScores = relevantContent
        .map((content: any) => {
          const match = searchResponse.matches.find(
            (m: any) => m.id === content._id.toString()
          );
          return {
            ...content.toObject(),
            similarityScore: match ? match.score : 0,
          };
        })
        .sort((a: any, b: any) => b.similarityScore - a.similarityScore)
        .slice(0, 2);

      // if no relevent content found
      if (contentWithScores.length === 0) {
        res.json({
          message:
            "No relevant content found in your second brain for this query",
          result: [],
        });
        return;
      }

      let context =
        "Below is the relevant information fromt he user's SyncBrain:\n\n";
      contentWithScores.forEach((item: any, index: number) => {
        context += `[Content ${index + 1}]\nTitle: ${item.title}\nType: ${
          item.type
        }`;
        if (item.link) context += `Link: ${item.link}\n`;
        context += `Content: ${item.content.substring(0, 300)}${
          item.content.length > 300 ? "..." : ""
        }\n\n`;
      });

      const prompt = `${context}\n\nUser query: "${query}"\n\nBased on the information above from the users sync brain, please provde a helpful and concise response to their query. If the information doesn't contain a direct answer, try to extract relevant insights that might be helpful.`;

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      const answer =
        result?.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "No response generated.";

      res.json({
        message: "Search result found",
        relevantContent: contentWithScores,
        answer: answer,
      });
    } catch (error) {
      console.error("Search error: ", error);
      res.status(500).json({
        message: "Error processing search request",
      });
    }
  }
);

app.post(
  "/api/v1/brain/share",
  auth,
  async (req: AuthRequest, res: Response) => {
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
        message: "Removed link",
      });
    }
  }
);

app.get("/api/v1/brain/:shareLink", async (req: Request, res: Response) => {
  const hash = req.params.shareLink;

  const link = await LinkModel.findOne({
    hash,
  });

  if (!link) {
    res.status(411).json({
      message: "Sorray incorrect input",
    });
    return;
  }

  const content = await ContentModel.find({
    userId: link.userId,
  });

  const user = await UserModel.findOne({
    _id: link.userId,
  });

  if (!user) {
    res.status(411).json({
      message: "user not found, error should idealy not happen",
    });
    return;
  }

  res.json({
    username: user.username,
    content: content,
  });
});

export default app;
