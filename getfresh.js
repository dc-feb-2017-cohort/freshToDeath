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

app.use(function(req, resp, next) {
  resp.locals.session = req.session;
  next();
});
//END MODULE IMPORTING/SETUP

//GLOBAL VARIABLES
var market_info_array = [];
var market_detail_results_array = [];
var marketID = null;
var mergedUSDAArray = null;
var market_info_results = null;
var dbReviewResults = null;
var coordinates;
//END GLOBAL VARIABLES

//BEGIN ROUTING FUNCTIONS
app.get('/', function(req, res){ //renders root/home page with home_page template
     res.render('home_page.hbs'); //this is the home page template (includes zip search bar)
});

app.post('/submit_login', function(req, resp) { //
  var username = req.body.username;
  var password = req.body.password;
  db.one(`select password, id from shoppers where username =  $1`, [username])
  .then(function(result) {
    var id = result.id;
    return [bcrypt.compare(password, result.password), id];
  })
  .spread(function(matched, id) {
    if (matched) {
      req.session.loggedInUser = username;
      req.session.shopper_id = id;
      resp.redirect('/');
    } else {
      resp.redirect('/');
    }
  })
    .catch(function(err) {
      console.log(err.message);
      resp.redirect('/');
  });
});

app.post('/write_review', function(req, resp) {
  var title = req.body.title;
  var content = req.body.content;
  var rating = parseInt(req.body.rating);
  var shopper_id = req.session.shopper_id;
  marketIDInt = parseInt(marketID);
  var marketName = marketNameRequest(mergedUSDAArray, marketID);
  console.log("Marketname:", marketName);
  db.any(`select id from markets where id = $1`,  [marketIDInt])
  .then(function(result) {
       if (result.length < 1) {
            db.none(`insert into markets (name, id) values ($1, $2)` , [marketName, marketIDInt]);
            console.log("hi");
       }
       return db.none(`insert into reviews (shopper_id, market_id, title, content, rating) values ($1, $2, $3, $4, $5)`, [shopper_id, marketIDInt, title, content, rating]);
 })
  .then(function() {
    marketIDInt = parseInt(marketID);
    resp.redirect('/');
    marketID = null;
  });
});

app.get('/search_results', function(req, res) {  //receives search parameter from home_page form
     let zip_search_input = req.query.zipsearch; //assigns search query parameter to zip_search_input variable
     return getResults(zip_search_input)
     .then(function (res) {
        return res.body;
     }) //FIRST USDA API call, using the zip code provided by user above
     .then(function(zip_search_results) { //an array of objects is returned from USDA with market ids and market names as keys
          return zipSearchResultsHandler(zip_search_results); //this helper function parses the JSON object and transforms it into an array of objects with key:value pairs of market id and market names
     })
     .then(function (usda_marketinfo_objects_array) { //the objects from above are passed into this function
       usda_marketinfo_objects_array.forEach(function(item){
         market_info_array.push(item);
       });
       return arrayOfIDAPICalls(usda_marketinfo_objects_array); //this helper function transforms the marketinfo array into an array of objects for mapping over to make the repeated calls to the USDA API to return the market detail data
     })
     .then(function(array_of_request_parameters){
       return Promise.map(array_of_request_parameters, function(each_object){ //we use the bluebird.map method here to asynchronously map over each item in the array and make an independent API call for each one of them
         return popsicle.request(each_object);//SECOND USDA API call; makes a series of calls with each market id as an argument
       });
     })
      .then(function(market_detail_results) { //returns an array of market details objects (with address, schedule, Google map link, and products sold)
        market_detail_results_array = market_detail_results.map(function (item){ //maps over the objects in the market details array, parsing the JSON objects (specifically the "body" values), and assigning them to a market_body variable (which is an array)
          return JSON.parse(item.body);
        });
        coordinates = market_detail_results_array.map(function(item) { //maps over the market_body array and uses the getCoordsFromUsda helper function to return the latitude and longitude for each item and then insert them into individual objects, and finally assigns them to the array "coordinates"
          return getCoordsFromUsda(item.marketdetails.GoogleLink);
        });

        mergedUSDAArray = mergeUSDAArrays(market_info_array, market_detail_results_array);
        res.render('search_results.hbs', {
          USDAinfo: mergedUSDAArray,
          coordinates : coordinates
      });
      })
      .then(function() {
        market_info_array = [];
        market_detail_results_array = [];

      })
     .catch(function(err){
     console.log(err.message);
     });
});

app.get("/market_page/:id", function(req, resp) {
  marketID = req.params.id;
  market_info_results = singleMarketRequest(mergedUSDAArray, marketID);
  db.any(`select * from reviews where market_id = $1`, [marketID])
  .then(function(reviews){
    console.log(reviews);
    resp.render('market_page.hbs', {
    market_info: market_info_results, //global variable
    market_reviews: reviews
    });
  })
    .catch(function(err) {

      console.log(err.message);
    });

});

app.get('/signup', function(req, resp) {
  resp.render('signup.hbs');
});
app.get('/logout', function (req, res){
     req.session.loggedInUser = null;
     res.redirect('/');
});

app.post('/signup', function(req, res, next) {
 var info = req.body;
  bcrypt.hash(info.password, 10)
    .then(function(encryptedPassword) {
      return db.none(`insert into shoppers values (default, $1, $2, $3)`,
      [info.username, info.email, encryptedPassword]);
    })
    .then(function() {
      req.session.loggedInUser = info.username;
      res.redirect('/');
    })
    .catch(next);
});

var recipeSearchResults = [];
var yummlyRecipeLinkInfo = [];
app.get('/recipessearch', function(req, resp) {
  resp.render('recipessearch.hbs');
});
app.get('/recipes', function(req, resp) { //This is the Yummly API call function
    var ingredient1 = req.query.ingredient1;
    var ingredient2 = req.query.ingredient2;
    var ingredient3 = req.query.ingredient3;
    var ingredient4 = req.query.ingredient4;
    var ingredient5 = req.query.ingredient5;
    return popsicle.request({
     method: 'GET',
     url: "http://api.yummly.com/v1/api/recipes?_app_id=cf10df74&_app_key=46a91a122338f6df55213530c127f027&q=" + ingredient1 + "+" + ingredient2 + "+" + ingredient3 + "+" + ingredient4 + "+" + ingredient5
   })
   .then(function(response) {
     var parsed = JSON.parse(response.body);
     recipeSearchResults = parsed;
     resp.render('recipes.hbs', {
       recipes: parsed.matches,
   });
 })
 .catch(function (err) {
   console.log(err.message);
   resp.render('recipessearch.hbs', {
     error: "Sorry, we were unable to find any recipes that match your search criteria."
 });
 });
});
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



// BEGIN HELPER FUNCTION DEFINITIONS --------------------------------
function getResults(zip_search_input) {
   return popsicle.request({
     method: 'GET',
     url: "http://search.ams.usda.gov/farmersmarkets/v1/data.svc/zipSearch?zip=" + zip_search_input,
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

function mergeUSDAArrays(firstAPI, secondAPI) { //this merges the two arrays that are returned from the two USDA API Calls
  var arrayOfObj = [];
  var labels = ['A','B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S',
  'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
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

function singleMarketRequest(arrayOfObj, suppliedID) {
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
