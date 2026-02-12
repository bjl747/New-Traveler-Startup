/**
 * TRAVELER ONBOARDING PORTAL - BACKEND SCRIPT
 * 
 * Instructions:
 * 1. Create a new Google App Script project at https://script.google.com/
 * 2. Paste this code into 'Code.gs'.
 * 3. Deploy as a Web App:
 *    - Click "Deploy" -> "New deployment"
 *    - Select type "Web app"
 *    - Description: "v3" (Updated)
 *    - Execute as: "Me" (your account)
 *    - Who has access: "Anyone"
 * 4. Update the GAS_ENDPOINT in app.js if the URL changes (updates usually keep the same URL if done correctly as 'New Version').
 */

// CONFIGURATION
const RECIPIENT_EMAIL = "blayher@primetimehealthcare.com";
const ROOT_FOLDER_NAME = "Traveler Onboarding Uploads";

function doPost(e) {
  // Lock to prevent race conditions during folder creation
  const lock = LockService.getScriptLock();
  try {
    // Wait for up to 30 seconds for other processes to finish.
    lock.waitLock(30000); 
  } catch (e) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: "Server busy, please try again." }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    let result;
    if (action === "UPLOAD_FILE") {
      result = handleFileUpload(data);
    } else if (action === "SUBMIT_REFERENCES") {
      result = handleReferenceSubmission(data);
    } else if (action === "NOTIFY_COMPLETION") {
      result = handleCompletionNotification(data);
    } else if (action === "NOTIFY_UPLOAD_STEP_COMPLETE") {
      result = handleUploadStepCompletion(data);
    } else {
      throw new Error("Invalid action: " + action);
    }
    
    return result;

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function handleFileUpload(data) {
  const { fileName, fileData, mimeType, userName } = data;

  // 1. Get or Create Root Folder
  let rootFolder;
  const folders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  if (folders.hasNext()) {
    rootFolder = folders.next();
  } else {
    rootFolder = DriveApp.createFolder(ROOT_FOLDER_NAME);
  }

  // 2. Get or Create User Subfolder inside Root
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
      folderUrl: userFolder.getUrl(), // ADDED THIS LINE
      message: "File uploaded successfully" 
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleReferenceSubmission(data) {
  const { userName, references } = data; 

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

function handleCompletionNotification(data) {
  const { userName } = data;
  
  // 1. Get Root Folder
  const folders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  let rootFolder;
  if (folders.hasNext()) {
    rootFolder = folders.next();
  } else {
    // Should exist if files were just uploaded, but safety check
    rootFolder = DriveApp.createFolder(ROOT_FOLDER_NAME);
  }
  
  // 2. Get User Subfolder
  const userFolders = rootFolder.getFoldersByName(userName);
  let userFolderUrl = "Folder not found - check Google Drive manually";
  if (userFolders.hasNext()) {
    userFolderUrl = userFolders.next().getUrl();
  }
  
  const completionSubject = `COMPLETED: Traveler Onboarding - ${userName}`;
  const completionBody = `
    Good news!
    
    ${userName} has completed all 3 steps of the onboarding process:
    1. Document Upload (Resume, BLS, ID, Certs)
    2. References Submitted
    3. HSH Testing Checklist Confirmed
    
    Access their documents folder here:
    ${userFolderUrl}
    
    Please review their folder in Google Drive and contact them to talk jobs.
  `;
  
  MailApp.sendEmail({
    to: RECIPIENT_EMAIL,
    subject: completionSubject,
    body: completionBody
  });
  
  
  return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleUploadStepCompletion(data) {
  const { userName } = data;
  
  // Simple notification - removed folder lookup
  const subject = `DOCS UPLOADED: Traveler Onboarding - ${userName}`;
  const body = `
    ${userName} has just uploaded their initial documents (Resume, ID, etc.).
    
    They have correctly completed Step 1.
    
    You will receive a final email with the folder link once they complete all steps.
  `;
  
  MailApp.sendEmail({
    to: RECIPIENT_EMAIL,
    subject: subject,
    body: body
  });
  
  return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Notification sent' }))
    .setMimeType(ContentService.MimeType.JSON);
}
