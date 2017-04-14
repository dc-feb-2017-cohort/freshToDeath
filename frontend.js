//
// var coordinates;
// $(
//   $('zipsearch').click(function() {
//   $.get('/coordinates',function(data,status){
//     coordinates = data;
//     console.log('Keyur was here');
//     console.log(coordinates);
//   });
// })
// );

var details;
var coordinates;

$("zipsearch").on("submit")('/search_results', function(req, res) {  //receives search parameter from search_page form
     var zip_search_input = req.query.zipsearch; //assigns search query parameter to zip_search_input variable
     return getResults(zip_search_input) //FIRST USDA API call, using the zip code provided by user above
     .then(function(zip_search_results) { //an array of objects is returned from USDA with market ids and market names as keys
          return zipSearchResultsHandler(zip_search_results); //this helper function parses the JSON object and transforms it into an array of objects with key:value pairs of market id and market names
     })
     .then(function (usda_marketinfo_objects_array) { //the objects from above are passed into this function
       details = usda_marketinfo_objects_array;
       return arrayOfIDAPICalls(usda_marketinfo_objects_array); //this helper function transforms the marketinfo array into an array of objects for mapping over to make the repeated calls to the USDA API to return the market detail data
     })
     .then(function(array_of_request_parameters){
       return Promise.map(array_of_request_parameters, function(each_object){ //we use the bluebird.map method here to asynchronously map over each item in the array and make an independent API call for each one of them
         return popsicle.request(each_object);//SECOND USDA API call; makes a series of calls with each market id as an argument
       });
     })
    .then(function(market_detail_results) { //returns an array of market details objects (with address, schedule, Google map link, and products sold)
      let market_body = market_detail_results.map(function (item){ //maps over the objects in the market details array, parsing the JSON objects (specifically the "body" values), and assigning them to a market_body variable (which is an array)
        return JSON.parse(item.body);
      });
      coordinates = market_body.map(function(item) { //maps over the market_body array and uses the getCoordsFromUsda helper function to return the latitude and longitude for each item and then insert them into individual objects, and finally assigns them to the array "coordinates"
        return getCoordsFromUsda(item.marketdetails.GoogleLink);
      });
      // console.log(coordinates);
    // .then(function(coordinates) {
      //GOOGLE MAPS API CALL NEEDS TO HAPPEN HERE. DO WE HAVE TO USE SOCKET.IO???
      res.render('search_results.hbs', {
          //  zip_search_results: usda_marketinfo_objects_array,
         coordinates: coordinates,
         market_detail_results: market_body//sends results from API call to search_results page
      });
      })
     .catch(function(err){
     console.log(err.message);
     });
});


// BEGIN HELPER FUNCTION DEFINITIONS --------------------------------
function getResults(zip_search_input) {
     return popsicle.request({
       method: 'GET',
       url: "http://search.ams.usda.gov/farmersmarkets/v1/data.svc/zipSearch?zip=" + zip_search_input,
     })
       .then(function (res) {
          return res.body;
       });
  }

  function zipSearchResultsHandler(searchresults) { //this function handles the JSON returned from USDA API and narrows it down to an array of marketnames
       return (new Promise (function(accept, reject) { //promisifies the function to be part of the promise chain above
            let market_info = [];
            var parsedresults = JSON.parse(searchresults);
            for (var key in parsedresults.results) {
               market_info.push({id : parsedresults.results[key].id, marketname: parsedresults.results[key].marketname.substr(4, parsedresults.results[key].marketname.length)});
            }
            accept(market_info);
       }));
     }


function arrayOfIDAPICalls(marketInfoResults) {
  let arrayofAPIrequests = [];
  arrayofAPIrequests = marketInfoResults.map(function (object) {
    return {
      method: 'GET',
      url: "http://search.ams.usda.gov/farmersmarkets/v1/data.svc/mktDetail?id=" + object.id,
    };
  });
  return(new Promise(function(accept,reject){
    accept(arrayofAPIrequests);
  }));
}

function getCoordsFromUsda(string) {
  let lastChar;
  let cord = {};
  for (var i = 26; i < string.length; i++) {
    if (string[i] === "%") {
      lastChar = (i - 1);
      let difference = lastChar - 25;
      cord.lat = parseFloat(string.substr(26, difference));
      break;
    }
  }
  let secondStart = lastChar + 7;
  for(var j = secondStart; j < string.length; j++) {
    if (string[j] === "%") {
      lastChar = (j - 1);
      let difference = lastChar - secondStart + 1;
      cord.lng = parseFloat(string.substr(secondStart, difference));
      break;
    }
  }
  return cord;
}

  // function initMap() {
  //
  //   var map = new google.maps.Map(document.getElementById('map'), {
  //     zoom: 3,
  //     // center: {lat: -28.024, lng: 140.887}
  //   });
  //
  //   // Create an array of alphabetical characters used to label the markers.
  //   var labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  //   // Add some markers to the map.
  //   // Note: The code uses the JavaScript Array.prototype.map() method to
  //   // create an array of markers based on a given "locations" array.
  //   // The map() method here has nothing to do with the Google Maps API.
  //   var markers = coordinates.map(function(location, i) {
  //     return new google.maps.Marker({
  //       position: location,
  //       label: labels[i % labels.length]
  //     });
  //   });

  //   // Add a marker clusterer to manage the markers.
  //   var markerCluster = new MarkerClusterer(map, markers,
  //       {imagePath: 'https://developers.google.com/maps/documentation/javascript/examples/markerclusterer/m'});
  // }
