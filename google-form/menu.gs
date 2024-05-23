// add menu to sheet
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("Execution Functions")
    .addItem("Set Token", "promptForToken")
    .addToUi();
}

// ui form for entering server token
function promptForToken() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt(
    "Server Token",
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() == ui.Button.OK) {
    storeToken(result.getResponseText());
  }
}

// store token into script property
function storeToken(token) {
  const scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.setProperty("SERVER_TOKEN", token);
}

