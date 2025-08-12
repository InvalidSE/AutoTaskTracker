import schedule from "node-schedule";
import ical from "node-ical";
import dotenv from "dotenv";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

// Load .env
console.log("[INFO] Loading environment variables...");
dotenv.config({quiet: true});

// Enable for very verbose logging
const logging = false;

// Create JWT authentication token
const serviceAccountAuth = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// Get document
const doc = new GoogleSpreadsheet(
  process.env.SPREADSHEET_URL,
  serviceAccountAuth
);
await doc.loadInfo();
console.log("[INFO] Successfully accessed document: " + doc.title);

// Get sheets
const rawUploadSheet = doc.sheetsByIndex[0];
const logSheet = doc.sheetsByIndex[1];

// Schedule updates
const job = schedule.scheduleJob("*/5 * * * *", () => {
  console.log("[INFO] Beginning update...");
  updateTaskTracker();
});

// Update function
async function updateTaskTracker() {
  // Get calendar
  console.log("[INFO] Fetching calendar...");
  const calendar = await ical.async.fromURL(
    process.env.CANVAS_ICS_URL,
    (err, data) => {
      if (!err) {
        return data;
      }
      console.log("[ERROR] " + err);
    }
  );

  // Get existing rows to check for duplicates
  await rawUploadSheet.loadCells();
  await logSheet.loadCells();
  const existingRows = await rawUploadSheet.getRows();
  const existingEventIds = new Set(existingRows.map((row) => row._rawData[0])); // Assuming eventId is in first column

  let newRows = [];
  let updatedRows = [];

  // Helper function to format date
  function formatDate(dateInput) {
    if (!dateInput) return "";

    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()); // No padding
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  for (const [eventId, eventData] of Object.entries(calendar)) {
    if (eventId === "vcalendar") continue;

    // Get class name
    const classNameMatch = eventData.summary?.match(/\[([^\]]+)\]/);
    const className = classNameMatch ? classNameMatch[1] : "Unknown";

    // Remove class name from summary
    const cleanedSummary =
      eventData.summary?.replace(/\s*\[[^\]]+\]\s*/, "").trim() || "";

    // Format dates
    const formattedStart = formatDate(eventData.start);
    const formattedEnd = formatDate(eventData.end);

    // Grab link if available
    let link = "";
    if (eventData.url && typeof eventData.url === "string") {
      link = eventData.url;
    } else if (eventData.url && typeof eventData.url === "object" && eventData.url.val) {
      link = eventData.url.val;
    }

    let currentRow = [
      eventId,
      cleanedSummary,
      className,
      formattedStart,
      formattedEnd,
      link,
    ];

    if (logging) {
      console.log(`Event ID: ${eventId}`);
      console.log(`Class Name: ${className}`);
      console.log(`Summary: ${cleanedSummary}`);
      console.log(`Start: ${formattedStart}`);
      console.log(`End: ${formattedEnd}`);
      console.log("---");
    }

    // Skip if event already exists
    if (existingEventIds.has(eventId)) {
      existingRows.forEach((element) => {
        if (element._rawData[0] == eventId) {
          if (
            element._rawData[3] == formattedStart &&
            element._rawData[4] == formattedEnd
          ) {
            if (logging) {
              console.log(`[SKIP] Skipping existing event: ${eventId}`);
            }
          } else {
            console.log(`[UPDATE] Updated event: ${eventId}`);
            if (logging) {
              console.log(
                `Old: ${element._rawData[3]}, new: ${formattedStart} / old end: ${element._rawData[4]}, new: ${formattedEnd}`
              );
            }
            updatedRows.push(currentRow);
          }
        }
      });
      continue;
    }

    console.log(`[NEW] New event: ${eventId}`);
    newRows.push(currentRow);
  }

  // Only add rows if there are new events
  if (newRows.length > 0) {
    console.log(`[INFO] Adding ${newRows.length} new events to spreadsheet`);
    await rawUploadSheet.addRows(newRows);
  } else {
    console.log("[INFO] No new events to add.");
  }

  try {
    if (updatedRows.length > 0) {
      console.log(`[INFO] Updating ${updatedRows.length} events.`);
      for (const updatedRow of updatedRows) {
        const [
          eventId,
          cleanedSummary,
          className,
          formattedStart,
          formattedEnd,
        ] = updatedRow;
        const rowToUpdate = existingRows.find(
          (row) => row._rawData[0] === eventId
        );
        if (rowToUpdate) {
          rowToUpdate._rawData[0] = eventId;
          rowToUpdate._rawData[1] = cleanedSummary;
          rowToUpdate._rawData[2] = className;
          rowToUpdate._rawData[3] = formattedStart;
          rowToUpdate._rawData[4] = formattedEnd;
          await rowToUpdate.save();
        }
      }
    } else {
      console.log("[INFO] No events to update.");
    }

    if (updatedRows.length > 0 || newRows.length > 0) {
      logSheet.addRow([
        formatDate(Date.now()),
        updatedRows.length,
        newRows.length,
        updatedRows.map((row) => row[0]).join(", "),
        newRows.map((row) => row[0]).join(", "),
      ]);
    }

    logSheet.getCell(0, 7).value = formatDate(Date.now());
    await logSheet.saveUpdatedCells();
  } catch {
    console.log(
      "[INFO] Probably rate limited. It'll fix itself on the next loop."
    );
  }

  console.log("[INFO] Update complete!");
}

updateTaskTracker();