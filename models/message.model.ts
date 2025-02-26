// models/message.model.ts
import mongoose, { Document, Model, Schema } from "mongoose";

export interface IMessage extends Document {
  senderId: Schema.Types.ObjectId;
  receiverId: Schema.Types.ObjectId;
  content: string;
  read: boolean;
  createdAt: Date;
}

const messageSchema: Schema<IMessage> = new mongoose.Schema({
  senderId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, "Sender ID is required"]
  },
  receiverId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, "Receiver ID is required"]
  },
  content: {
    type: String,
    required: [true, "Message content is required"]
  },
  read: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add indexes for faster message retrieval
messageSchema.index({ senderId: 1, receiverId: 1 });
messageSchema.index({ receiverId: 1, read: 1 });

const Message: Model<IMessage> = mongoose.model("Message", messageSchema);

export default Message;