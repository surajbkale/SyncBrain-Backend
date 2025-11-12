import express from "express";
import { shareBrain, getBrainShareLink } from "../controllers/shareController";
import { auth } from "../middleware/auth";

const router = express.Router();

router.post("/", auth, shareBrain);
router.get("/:shareLink", getBrainShareLink);

export default router;
