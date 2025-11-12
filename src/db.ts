import mongoose, { mongo, Types } from "mongoose";

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
});

const ContentSchema = new mongoose.Schema(
  {
    title: {
      title: String,
      require: true,
    },
    type: {
      type: String,
      require: true,
    },
    link: {
      type: String,
    },
    content: {
      type: String,
    },
    imageUrl: {
      type: String,
    },
    tags: [
      {
        types: Types.ObjectId,
        ref: "Tag",
      },
    ],
    userId: {
      types: Types.ObjectId,
      ref: "User",
      require: true,
    },
  },
  { timestamps: true }
);

const LinkSchema = new mongoose.Schema({
  hash: {
    type: String,
    require: true,
  },
  userId: {
    type: mongoose.Types.ObjectId,
    ref: "User",
    require: true,
  },
});

export const UserModel = mongoose.model("User", UserSchema);
export const ContentModel = mongoose.model("Content", ContentSchema);
export const LinkModel = mongoose.model("Share", LinkSchema);
