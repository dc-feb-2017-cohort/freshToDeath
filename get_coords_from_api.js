var string = "http://maps.google.com/?q=33.8635033%2C%20-83.4097748%20(%22Oconee+Farmers+Market%22)";

function getCoordsFromUsda(string) {
  let lastChar;
  let cord = {};
  for (var i = 26; i < string.length; i++) {
    if (string[i] === "%") {
      lastChar = (i - 1);
      let difference = lastChar - 25;
      cord.lat = string.substr(26, difference);
      break;
    }
  }
  let secondStart = lastChar + 7;
  for(var j = secondStart; j < string.length; j++) {
    if (string[j] === "%") {
      lastChar = (j - 1);
      let difference = lastChar - secondStart + 1;
      cord.long = string.substr(secondStart, difference);
      break;
    }
  }
  return cord;
}
