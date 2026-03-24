import multer from "multer";
import { badRequest } from "../utils/errors";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const uploadSingle = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(badRequest("Invalid file type. Allowed: JPEG, PNG, WebP"));
    }
  },
}).single("image");

const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
];
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10MB

export const uploadDocuments = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_DOCUMENT_SIZE,
    files: 5,
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(badRequest("Invalid file type. Allowed: PDF, DOC, DOCX, JPEG, PNG"));
    }
  },
}).array("documents", 5);

export const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_DOCUMENT_SIZE,
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(badRequest("Invalid file type. Allowed: PDF, DOC, DOCX, JPEG, PNG"));
    }
  },
}).single("document");
