import schedule from 'node-schedule';
import ical from 'node-ical';
import dotenv from 'dotenv';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
dotenv.config();

const serviceAccountAuth = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet('141qj69vdIlsFm8gG6JQLCHOXwcHohujiXlMHCAiotCI', serviceAccountAuth);
await doc.loadInfo();
console.log("Accessed document: " + doc.title);
const testSheet = doc.sheetsByIndex[0];

const job = schedule.scheduleJob('0 1 * * *', () => {
    updateTaskTracker();
});

async function updateTaskTracker() {
    // Get calendar
    console.log("Getting ICS...");
    const calendar = await ical.async.fromURL(process.env.CANVAS_ICS_URL, (err, data) => { 
        if(!err) {
            return data;
        }
        console.log(err);
    });

    // console.log(calendar);

    // Get and update assignment tracker

}

updateTaskTracker();
