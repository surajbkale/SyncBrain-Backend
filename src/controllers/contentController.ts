import { Request, Response } from "express";
import mongoose from "mongoose";
import { ContentModel } from "../models";
import { AuthRequest } from "../types";
import { getPineconeIndex } from "../config/pinecone";
import { getEmbedding } from "../services/embeddings";
import { scrapeUrl, isValidImageUrl } from "../services/scraper";
import { contentSchema } from "../utils/validation";

export const addContent = async (
  req: Request,
  res: Response
): Promise<void> => {
  const validation = contentSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      message: "Invalid input format",
      errors: validation.error.message,
    });
    return;
  }

  const { link, title, type, content } = validation.data;

  try {
    let contentToSave = content || "";
    let titleToSave = title || "";
    let imageUrl: string | null = null;

    if (type === "url" && link) {
      const scrapedData = await scrapeUrl(link);

      if (scrapedData.content) {
        contentToSave = scrapedData.content;
      }

      if (!titleToSave && scrapedData.title) {
        titleToSave = scrapedData.title;
      }

      // validate image URL before saving
      if (scrapedData.imageUrl && isValidImageUrl(scrapedData.imageUrl)) {
        imageUrl = scrapedData.imageUrl;
      }
    }

    // generate timestamp in a human-readable format
    const timestamp = new Date().toLocaleString();

    // Prepare text for embedding (Ensure it's a valid string)
    const textForEmbedding = `Title: ${titleToSave}\nDate: ${timestamp}\nContent: ${contentToSave}`;

    // Save to MongoDB
    const newContent = await ContentModel.create({
      title: titleToSave,
      link,
      type,
      content: contentToSave,
      imageUrl,
      tag: [],
      userId: req.userId,
      createdAt: new Date(),
    });

    // Generate vector embedding
    const embedding = await getEmbedding(textForEmbedding);
    const pineconeIndex = getPineconeIndex();

    // Upsert into Pinecone
    await pineconeIndex.upsert([
      {
        id: newContent._id.toString(),
        values: embedding,
        metadata: {
          userId: req.userId?.toString() || "",
          title: titleToSave,
          contentType: type,
          timestamp: timestamp,
          snippet: contentToSave.substring(0, 100),
          imageUrl: imageUrl || "",
        },
      },
    ]);

    res.status(200).json({
      message: "Content added successfully",
      contentId: newContent._id,
      imageUrl: imageUrl || null,
    });
  } catch (error) {
    console.error(`Error adding content: ${error}`);
    res.status(500).json({
      message: "Internal Server error",
    });
  }
};

export const getContent = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.userId;

  try {
    const content = await ContentModel.find({
      userId: userId,
    }).populate("userId", "username");

    if (content.length === 0) {
      res.json({
        content: [
          {
            _id: "default-1",
            type: "Note",
            title: "Welcome to SyncBrain!",
            content:
              "This is your default content. Start exploring now! click on Add Memory to add more content",
            imageUrl: null,
          },
        ],
      });
      return;
    }

    res.status(200).json({
      content: content.map((item) => ({
        _id: item._id,
        title: item.title,
        type: item.type,
        content: item.content,
        link: item.link || null,
        imageUrl: item.imageUrl || null,
        userId: item.userId,
        createdAt: item.createdAt,
      })),
    });
  } catch (error) {
    console.error(`Error getting the content: ${error}`);
    res.status(500).json({
      message: "Internal server error",
    });
  }
};

export const deleteContent = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { contentId } = req.params;

  if (!contentId || !mongoose.Types.ObjectId.isValid(contentId)) {
    res.status(400).json({
      error: "Invalid or missing content ID",
    });
    return;
  }

  try {
    // Deleting form db
    await ContentModel.deleteOne({
      _id: contentId,
      userId: req.userId,
    });

    // deleting from pinecone
    const pineconeIndex = getPineconeIndex();
    await pineconeIndex.deleteOne(contentId);

    res.status(200).json({
      message: "Content deleted successfully",
    });
  } catch (error) {
    console.error(`Error deleting content: ${error}`);
    res.status(500).json({
      message: "Error deleting content",
    });
  }
};
