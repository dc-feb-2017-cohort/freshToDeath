//BEGIN MODULE IMPORTING/SETUP

var dbconfig = require('./config');
const express = require('express');
const Promise = require('bluebird');
const session = require('express-session');
const pgp = require('pg-promise')({
  promiseLib: Promise
});
var db = pgp(dbconfig);
const bodyParser = require('body-parser');
const app = express();
const bcrypt = require('bcrypt');
const popsicle = require('popsicle');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({extended: false}));
app.set('view engine', 'hbs');
app.use(session({
  secret: 'topsecret',
  cookie: {
    maxAge: 600000000
  }
}));

app.use(function(req, res, next) {
  res.locals.session = req.session;
  next();
});
//END MODULE IMPORTING/SETUP

//GLOBAL VARIABLE DEFINITIONS
var globalMarketNameIDArray;
var marketDetailArray;
var mergedUSDAArray;
var marketCoordinates;
var marketID;
var selectedMarketInformation;
var dbReviewResults = null;
var recipeSearchResults = [];
var yummlyRecipeLinkInfo = [];
//END GLOBAL VARIABLE DEFINITIONS

//BEGIN ROUTING FUNCTIONS
app.get('/', function(req, res){ //renders root/home page with home_page template
     res.render('home_page.hbs'); //this is the home page template (includes zip search bar)
});

app.post('/', function(req, res) { //the login form from the layout.hbs file redirects here
  var username = req.body.username; //pulls username submitted by user in the form on the layout.hbs page
  var password = req.body.password; //pulls password from the same form
  db.one(`select password, id from shoppers where username =  $1`, [username]) //db query that returns password and shopper id associated with the entered username
  .then(function(result) {
    var id = result.id; //assigns shopper id to var id to spread it below
    return [bcrypt.compare(password, result.password), id]; //returns two items so we can spread them below; bcrypt is a promise that checks submitted pw against encrypted one in database
  })
  .spread(function(matched, id) {
    if (matched) { //if the two passwords match, then the user is authenticated (and their username is assigned to the session.loggedInUser, along with their shopper id which we use later to associate reviews with that user)
      req.session.loggedInUser = username;
      req.session.shopper_id = id;
    }
    res.redirect('back'); //this redirects the user to the current page upon sign in
  })
  .catch(function(error) {
    res.render('home_page.hbs', {
      error: 'Incorrect Username or Password.' //bcrypt will throw an error if the passwords don't match and this will be rendered to the home page
    });
  });
});

app.get('/logout', function (req, res){
     req.session.loggedInUser = null;
     res.redirect('/');
});

app.get('/search_results', function(req, res) {  //receives zip search argument from search_results form on home_page.hbs
 var zipSearchInput = req.query.zipsearch; //assigns zip search input from the form to zipSearchInput variable
  getResults(zipSearchInput) //helper function (see helper functions section below) (FIRST USDA API call)
  .then(function (marketNameIDObject) { //an object with an array of objects is returned from USDA with market ids and market names as keys
     return zipSearchResultsHandler(marketNameIDObject.body); //this helper function parses the JSON object and transforms it into an array of objects with key:value pairs of market id and market names (see in helper function section below)
  })
  .then(function (marketNameIDArray) { //the objects from above are passed into this function
    globalMarketNameIDArray = marketNameIDArray; //assign this to a global since bluebird.spread is not supported by popsicle
    return arrayOfIDAPICalls(marketNameIDArray); //this helper function transforms the marketNameIDArray into an array of objects for mapping over to make the repeated calls to the USDA API to return the market detail data (see more in helper functions below)
  })
  .then(function(arrayOfRequestPackages){
    return Promise.map(arrayOfRequestPackages, function(eachPackage){ //we use the bluebird.map method here to map over each item in the array and make an independent API call for each one of them
      return popsicle.request(eachPackage);//SECOND USDA API call; makes a series of calls with each market id included in the package (these are promises themselves)
    });
  })
  .then(function(marketDetailObject) { //returns an array of market details objects (with address, schedule, Google map link, and products sold) in JSON format
    marketDetailArray = marketDetailObject.map(function(item){ //maps over the objects in the market details array, parsing the JSON objects (specifically the "body" values), and assigning them to the marketDetailArray
      return JSON.parse(item.body);
    });
    marketCoordinates = marketDetailArray.map(function(item) { //maps over the marketDetailArray and uses the getCoordsFromUsda helper function to return the latitude and longitude for each item and then insert them into individual objects, and finally assigns them to the array "marketCoordinates", which is global; (see helper function section below for more on getCoordsFromUsda function)
      return getCoordsFromUsda(item.marketdetails.GoogleLink);
    });
    mergedUSDAArray = mergeUSDAArrays(globalMarketNameIDArray, marketDetailArray); //zip the two arrays which are the results of the two separate API calls into a one dimensional array of objects for rendering to the search_results page (see helper functions below)
    res.render('search_results.hbs', {
      USDAinfo: mergedUSDAArray, //renders the market names and details to the search_results page
      marketCoordinates : marketCoordinates //pass the coordinates to the search_results page to be used in the Google Maps API call
    });
  })
  .catch(function(err){
    console.log(err.message);
    res.render('home_page.hbs', {
      error_zip: "Sorry, we were unable to find any recipes that match your search criteria. Please try your search again."
    });
  });
});

app.get("/market_page/:id", function(req, res) { //this get request refers to the search_results page
  marketID = req.params.id; //pulls the marketID from the search_results page based on the market specific button the uses clicks on
  selectedMarketInformation = findMarketInGlobalArray(mergedUSDAArray, marketID); //see helper functions below
  db.any(`select * from reviews where market_id = $1`, [marketID]) //does a db query for reviews linked this unique market
  .then(function(reviews){
    res.render('market_page.hbs', {
    market_info: selectedMarketInformation, //renders page with market info
    market_reviews: reviews //if there are reviews, the page will include those reviews from the db
    });
  })
  .catch(function(err) {
    console.log(err.message);
  });
});

app.post('/write_review', function(req, res) { //COMMENTS NEEDED HERE
  var title = req.body.title;
  var content = req.body.content;
  var rating = parseInt(req.body.rating);
  var shopper_id = req.session.shopper_id;
  marketIDInt = parseInt(marketID);
  var marketName = marketNameRequest(mergedUSDAArray, marketID);
  db.any(`select id from markets where id = $1`,  [marketIDInt])
  .then(function(result) {
   if (result.length < 1) {
        db.none(`insert into markets (name, id) values ($1, $2)` , [marketName, marketIDInt]);
   }
   return db.none(`insert into reviews (shopper_id, market_id, title, content, rating) values ($1, $2, $3, $4, $5)`, [shopper_id, marketIDInt, title, content, rating]);
  })
  .then(function() {
    marketIDInt = parseInt(marketID);
    res.redirect('back');
    marketID = null;
  });
});

app.get('/signup', function(req, res) { //renders the signup.hbs page when the user is routed to the sign up url (linked to from the home page)
  res.render('signup.hbs');
});

app.post('/signup', function(req, res, next) { //use post so user's info is not included in the url
 var info = req.body; //grabs info user entered from body of form (including password, email, and username)
 if (info.username === '' || info.password === '' || info.email === '') {
   res.render('signup.hbs', {
     error : "Incomplete account information. Please try again."
   });
 } else {
  bcrypt.hash(info.password, 10) //encrypts password
    .then(function(encryptedPassword) {
      return db.none(`insert into shoppers values (default, $1, $2, $3)`, //inserts account info into db
      [info.username, info.email, encryptedPassword]);
    })
    .then(function() {
      req.session.loggedInUser = info.username; //upon sign up, user becomes session loggedInUser
      res.redirect('/'); //redirected to home page
    })
    .catch(next);
  }
});

app.get('/recipessearch', function(req, res) { //renders the recipessearch.hbs page when the user is routed to the recipe search url (linked to from the home page)
  res.render('recipessearch.hbs');
});

app.get('/recipes', function(req, res) {
    var ingredient1 = req.query.ingredient1; //grabs this info from the recipe search page
    var ingredient2 = req.query.ingredient2;
    var ingredient3 = req.query.ingredient3;
    var ingredient4 = req.query.ingredient4;
    var ingredient5 = req.query.ingredient5;
    return popsicle.request({ //makes call to Yummly API
     method: 'GET',
     url: "http://api.yummly.com/v1/api/recipes?_app_id=cf10df74&_app_key=46a91a122338f6df55213530c127f027&q=" + ingredient1 + "+" + ingredient2 + "+" + ingredient3 + "+" + ingredient4 + "+" + ingredient5
   })
   .then(function(results) { //results include JSON object with all of the matching recipes included
     var parsed = JSON.parse(results.body);
     recipeSearchResults = parsed; //global variable that will be used for second call to Yummly API (in progress by Aaron)
     res.render('recipes.hbs', {
       recipes: parsed.matches, //renders recipe results to recipes.hbs page
   });
   })
   .catch(function (err) {
     console.log(err.message);
     res.render('recipessearch.hbs', {
       error: "Sorry, we were unable to find any recipes that match your search criteria."
   });
 });
});

// BEGIN HELPER FUNCTION DEFINITIONS --------------------------------
function getResults(zipSearchInput) { //calls the USDA API with the user submitted zip code
 return popsicle.request({ //returns a popsicle promise that calls the API and then returns the JSON object with market names and market IDs
   method: 'GET',
   url: "http://search.ams.usda.gov/farmersmarkets/v1/data.svc/zipSearch?zip=" + zipSearchInput,
 });
}

function zipSearchResultsHandler(searchResults) { //this function handles the JSON returned from USDA API and narrows it down to an array of marketnames and market ids
  return (new Promise (function(accept, reject) { //promisifies the function to be part of the promise chain above (which allows an error to be thrown and received by the .catch function in the chain)
    var arrayOfMarketnamesAndIDs = [];
    var parsedResults = JSON.parse(searchResults);
    for (var key in parsedResults.results) {
      arrayOfMarketnamesAndIDs.push({id : parsedResults.results[key].id, marketname: parsedResults.results[key].marketname.substr(4, parsedResults.results[key].marketname.length)}); //removes distance float from marketname value
    }
    accept(arrayOfMarketnamesAndIDs);
  }));
}

function arrayOfIDAPICalls(marketNameIDArray) { //returns an array of requests to the USDA API for the second call; these are essentially request packages (objects) that are then passed popsicle above to finally return market details for each market that the inital zip search returned
  arrayofAPIrequests = marketNameIDArray.map(function (object) {
    return {
      method: 'GET',
      url: "http://search.ams.usda.gov/farmersmarkets/v1/data.svc/mktDetail?id=" + object.id,
    };
  });
  return(new Promise(function(accept,reject){
    accept(arrayofAPIrequests);
  }));
}

function getCoordsFromUsda(string) { //takes in the GoogleLink from the objects in the marketDetailArray and pulls out the lat and long values
  //this is what the link from the object looks like: http://maps.google.com/?q=33.7788269%2C%20-84.2974842%20(%22Decatur+Farmers+Market+%22)
  var lastChar;
  var cord = {};
  for (var i = 26; i < string.length; i++) {
    if (string[i] === "%") {
      lastChar = (i - 1);
      var difference = lastChar - 25;
      cord.lat = parseFloat(string.substr(26, difference));
      break;
    }
  }
  var secondStart = lastChar + 7;
  for(var j = secondStart; j < string.length; j++) {
    if (string[j] === "%") {
      lastChar = (j - 1);
      var difference = lastChar - secondStart + 1;
      cord.lng = parseFloat(string.substr(secondStart, difference));
      break;
    }
  }
  return cord; //returns an object of lat and long key:value pairs for each market detail object
}

function mergeUSDAArrays(firstAPI, secondAPI) { //this merges the two arrays that are returned from the two USDA API Calls
  var arrayOfObj = [];
  var labels = ['A','B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S',
  'T', 'U', 'V', 'W', 'X', 'Y', 'Z']; //this assigns each market entry a label that corresponds to the Google map
  for (var i = 0; i < firstAPI.length; i++) {
   newAPI = {};
   newAPI.marketname = firstAPI[i].marketname;
   newAPI.marketID = firstAPI[i].id;
   newAPI.address = secondAPI[i].marketdetails.Address;
   newAPI.googlelink = secondAPI[i].marketdetails.GoogleLink;
   newAPI.products = secondAPI[i].marketdetails.Products;
   newAPI.schedule = secondAPI[i].marketdetails.Schedule;
   newAPI.mapMarkerLetter = labels[i];
   arrayOfObj.push(newAPI);
  }
  return arrayOfObj;
}

function createRecipeObject(firstAPI, secondAPI) {
  for (var i = 0; i < firstAPI.length; i++) {
   recipeList = {};
   newAPI.marketname = firstAPI[i].marketname;
   newAPI.marketID = firstAPI[i].id;
   newAPI.address = secondAPI[i].marketdetails.Address;
   newAPI.googlelink = secondAPI[i].marketdetails.GoogleLink;
   newAPI.products = secondAPI[i].marketdetails.Products;
   newAPI.schedule = secondAPI[i].marketdetails.Schedule;
   newAPI.mapMarkerLetter = labels[i];
   arrayOfObj.push(newAPI);
  }
  return recipeList;
}

function findMarketInGlobalArray(arrayOfObj, suppliedID) { //pass in the global mergedUSDAArray and marketID to return the market name and details for the user-selected market
  for (var i = 0; i < arrayOfObj.length; i++) {
    if (arrayOfObj[i].marketID === suppliedID) {
      return arrayOfObj[i];
    }
  }
}

function marketNameRequest(arrayOfObj, suppliedID) {
  for (var i = 0; i < arrayOfObj.length; i++) {
    if (arrayOfObj[i].marketID === suppliedID) {
      return arrayOfObj[i].marketname;
    }
  }
}

//EXPRESS LISTEN FUNCTION BELOW (MUST STAY AT THE BOTTOM OF THE FILE)
app.listen(3000, function() {
  console.log('Listening on port 3000.');
});
