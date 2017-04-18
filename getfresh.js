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

//BEGIN ROUTING FUNCTIONS
app.get('/login', function(req, resp) {

});


app.post('/submit_login', function(req, resp) {
  var username = req.body.username;
  var password = req.body.password;
  db.one(`select password from shoppers where username =  $1`, [username])
  .then(function(result) {
    return bcrypt.compare(password, result.password);
  })
  .then(function(matched) {
    if (matched) {
      req.session.loggedInUser = username;
      resp.redirect('/');
    } else {
      resp.redirect('/');
    }
  })
    .catch(function(err) {
      resp.redirect('/');
  });
});

app.get('/', function(req, res){ //renders search/home page with search_page template when user requests it
     res.render('search_page.hbs');
});
app.get('/veg_search', function(req, res){ //renders search by ingredients page on search
     res.render('veg_search.hbs');
});



var market_info_array = [];
var market_detail_results_array = [];

var coordinates;
app.get('/search_results', function(req, res) {  //receives search parameter from search_page form
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

        var mergegUSDAArray = mergeUSDAArrays(market_info_array, market_detail_results_array);
        res.render('search_results.hbs', {
          USDAinfo: mergegUSDAArray,
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

app.get('/market', function(req, resp, next) {
  resp.render('market.hbs');
  // let id = req.params.id;
  // db.any(``)
  //   .then(function(reviews) {
  //     return [
  //       reviews,
  //       db.one(``)
  //     ];
  //   })
  //   .spread(function(reviews, markets) {
  //     resp.render('market.hbs', {
  //       markets: markets,
  //       reviews: reviews
  //     });
  //   })
  //   .catch(next);
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
     var names = [];
     var parsed = JSON.parse(response.body);
     for (i = 0; i <= 5; i++) {
       names.push(parsed.matches[i].recipeName); //this part needs to be amended to push different values to the names array to then be rendered on the hbs page
     }
     resp.render('recipes.hbs', {
       recipes: names
   });
 })
 .catch(function (err) {
   console.log(err.message);
   resp.render('recipessearch.hbs', {
     error: "Sorry, we were unable to find any recipes that match your search criteria."
 });
 });
});

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

function mergeUSDAArrays(firstAPI, secondAPI) {
  var arrayOfObj = [];
  for (var i = 0; i < firstAPI.length; i++) {
   newAPI = {};
   newAPI.marketname = firstAPI[i].marketname;
   newAPI.marketID = firstAPI[i].id;
   newAPI.address = secondAPI[i].marketdetails.Address;
   newAPI.googlelink = secondAPI[i].marketdetails.GoogleLink;
   newAPI.products = secondAPI[i].marketdetails.Products;
   newAPI.schedule = secondAPI[i].marketdetails.Schedule;
   arrayOfObj.push(newAPI);
  }
  return arrayOfObj;
}

//EXPRESS LISTEN FUNCTION BELOW (MUST STAY AT THE BOTTOM OF THE FILE)
app.listen(3000, function() {
  console.log('Listening on port 3000.');
});
