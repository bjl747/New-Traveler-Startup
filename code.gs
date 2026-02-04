/**
 * TRAVELER ONBOARDING PORTAL - BACKEND SCRIPT
 * 
 * Instructions:
 * 1. Create a new Google App Script project at https://script.google.com/
 * 2. Paste this code into 'Code.gs'.
 * 3. Deploy as a Web App:
 *    - Click "Deploy" -> "New deployment"
 *    - Select type "Web app"
 *    - Description: "v1"
 *    - Execute as: "Me" (your account)
 *    - Who has access: "Anyone" (IMPORTANT for the app to work without Google login prompt)
 * 4. Copy the Web App URL and paste it into `app.js` in the `GAS_ENDPOINT` constant.
 */

// CONFIGURATION
const RECIPIENT_EMAIL = "blayher@primetimehealthcare.com";
const ROOT_FOLDER_NAME = "Traveler Onboarding Uploads";

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    if (action === "UPLOAD_FILE") {
      return handleFileUpload(data);
    } else if (action === "SUBMIT_REFERENCES") {
      return handleReferenceSubmission(data);
    } else {
      throw new Error("Invalid action: " + action);
    }

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleFileUpload(data) {
  const { fileName, fileData, mimeType, userName } = data; // userName should be "First Last"

  // 1. Get or Create Root Folder
  let rootFolder;
  const folders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  if (folders.hasNext()) {
    rootFolder = folders.next();
  } else {
    rootFolder = DriveApp.createFolder(ROOT_FOLDER_NAME);
  }

  // 2. Get or Create User Subfolder
  let userFolder;
  const userFolders = rootFolder.getFoldersByName(userName);
  if (userFolders.hasNext()) {
    userFolder = userFolders.next();
  } else {
    userFolder = rootFolder.createFolder(userName);
  }

  // 3. Decode and Save File
  const decodedData = Utilities.base64Decode(fileData);
  const blob = Utilities.newBlob(decodedData, mimeType, fileName);
  const file = userFolder.createFile(blob);

  return ContentService
    .createTextOutput(JSON.stringify({ 
      status: "success", 
      fileUrl: file.getUrl(),
      message: "File uploaded successfully" 
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleReferenceSubmission(data) {
  const { userName, references } = data; // references is an array of 2 reference objects

  let emailBody = `
    <h2>New Reference Submission</h2>
    <p><strong>Candidate:</strong> ${userName}</p>
    <hr>
  `;

  references.forEach((ref, index) => {
    emailBody += `
      <h3>Reference #${index + 1}</h3>
      <ul>
        <li><strong>Name:</strong> ${ref.fullName}</li>
        <li><strong>Title:</strong> ${ref.title}</li>
        <li><strong>Facility:</strong> ${ref.facility}</li>
        <li><strong>Phone:</strong> ${ref.phone}</li>
        <li><strong>Email:</strong> ${ref.email || "N/A"}</li>
      </ul>
      <br>
    `;
  });

  MailApp.sendEmail({
    to: RECIPIENT_EMAIL,
    subject: `Onboarding References: ${userName}`,
    htmlBody: emailBody
  });

  return ContentService
    .createTextOutput(JSON.stringify({ 
      status: "success", 
      message: "References submitted and email sent." 
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
