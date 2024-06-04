const SERVER_URL = "";

// run on form submission
function formSubmitHandler(e) {
  // when ran from editor, use mock submission
  let data = e ? e.namedValues : {
    "Language": ["Python"],
    "Code": [`n1 = int(input())
n2 = int(input())
print(n1 + n2)
`],
    "Team Name": ["The Louvre"],
    "Timestamp": ["5/21/2024 21:06:59"],
    "Problem": ["Sanity Addition"],
    "Email Address": ["2001246@apps.nsd.org"]
  };
  let payload = {
    "Team Name": data["Team Name"][0],
    "Email": data["Email Address"][0],
    "Problem": data["Problem"][0],
    "Code": data["Code"][0],
    "Language": data["Language"][0],
    "Timestamp": data["Timestamp"][0]
  }
  Logger.log(payload);

  // post submission to server
  const scriptProperties = PropertiesService.getScriptProperties();
  let options = {
    "method": "POST",
    "headers": {
      Authorization: `Bearer ${scriptProperties.getProperty("SERVER_TOKEN")}`,
      "Content-Type": "application/json"
    },
    "payload": JSON.stringify(payload)
  };
  let response = UrlFetchApp.fetch(`${SERVER_URL}/eval`, options);

  if (response.getResponseCode() != 200)
    throw new Error(response.getContentText())
  Logger.log(response.getContentText());
}
