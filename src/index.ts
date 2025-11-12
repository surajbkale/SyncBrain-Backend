import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import { connectDatabase } from "./config/db";
import { initPinecone } from "./config/pinecone";

const PORT = process.env.PORT || 3000;

const startServer = async (): Promise<void> => {
  try {
    // Connect to MongoDB
    await connectDatabase();

    // Initialize Pinecone
    await initPinecone();

    // Start Express Server
    app.listen(PORT, () => {
      console.log(`Server is running on port: ${PORT}`);
    });
  } catch (error) {
    console.error(`Failed to start server: ${error}`);
    process.exit(1);
  }
};

startServer();
