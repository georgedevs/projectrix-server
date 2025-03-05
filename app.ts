require('dotenv').config();
import express, { NextFunction, Request, Response } from "express"
export const app = express()
import cors from "cors"
import cookieParser from 'cookie-parser'
import { ErrorMiddleware } from "./middleware/error";
import userRouter from "./routes/userRoute";
import generateRouter from "./routes/generateRoute";
import { requestLogger } from "./middleware/requestLogger";
import userProfileRouter from "./routes/userProfileRoutes";
import messageRouter from "./routes/messageRoutes";
import collaborationRouter from "./routes/collaborationRoutes";
import publishedProjectsRouter from "./routes/publishedProjectsRoutes";
import feedbackRouter from "./routes/feedbackRoutes";
import discordRouter from "./routes/discordRoutes";
import activityRouter from "./routes/activityRoutes";

app.use(express.json({limit:"50mb"}));

app.use(cookieParser());

app.use(cors({
    origin: process.env.ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(requestLogger);

app.use("/api/v1", userRouter);
app.use("/api/v1", generateRouter);
app.use("/api/v1",userProfileRouter);
app.use("/api/v1",messageRouter);
app.use("/api/v1",collaborationRouter);
app.use("/api/v1",publishedProjectsRouter);
app.use("/api/v1",feedbackRouter);
app.use("/api/v1", discordRouter);
app.use("/api/v1", activityRouter);

app.get("/test", (req:Request, res:Response, next:NextFunction) => {
    res.status(200).json({
        success:"true",
        message:"API is working"
    })
})

app.all("*", (req: Request, res: Response, next: NextFunction) => {
    const err = new Error(`Route ${req.originalUrl} not found`) as any;
    err.statusCode = 404;
    next(err);
});

app.use(ErrorMiddleware)