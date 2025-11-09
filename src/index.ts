import express from "express";
import jwt from "jsonwebtoken";

const app = express();
const PORT = process.env.PORT || 3000;

app.post("/api/v1/signup", (req, res) => {});

app.post("/api/v1/signin", (req, res) => {});

app.post("/api/v1/content", (req, res) => {});

app.get("/api/v1/content", (req, res) => {});

app.delete("/api/v1/content", (req, res) => {});

app.get("/api/v1/brain/:shareLink", (req, res) => {});

app.post("/api/v1/brain/share", (req, res) => {});

app.use(express.json());
