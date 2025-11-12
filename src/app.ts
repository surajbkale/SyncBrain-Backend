import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes";
import contentRoutes from "./routes/contentRoutes";
import searchRoutes from "./routes/searchRoutes";
import shareRoutes from "./routes/shareRoutes";

const app = express();

const allowedOrigins = [
  "https://syncbrain.bitalchemy.app",
  "http://localhost:5173",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Server health check - SyncBrain is Running!");
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/content", contentRoutes);
app.use("/api/v1/search", searchRoutes);
app.use("/api/v1/share", shareRoutes);

export default app;
