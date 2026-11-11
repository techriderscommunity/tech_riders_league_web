import { sendQueuedMail } from "../src/lib/management/mail.ts";
import { database } from "../src/lib/management/db.ts";
try { console.log(`Messages accepted by SMTP: ${await sendQueuedMail()}`); }
finally { await database().end(); }
