const express = require('express');
const Promise = require('bluebird');
const session = require('express-session');
const pgp = require('pg-promise')({
  promiseLib: Promise
});
const bodyParser = require('body-parser');
const app = express();
const bcrypt = require('bcrypt');
const config = require('./config.js');
const db = pgp(config);
const popsicle = require('popsicle');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({extended: false}));
app.set('view engine', 'hbs');
app.use(session({
  secret: 'topsecret',
  cookie: {
    maxAge: 60000000
  }
}));
//END MODULE IMPORTING/SETUP

//BEGIN ROUTING FUNCTIONS
app.get('/', function(req, res){ //renders search/home page with search_page template when user requests it
     res.render('search_page.hbs');
});

app.get('/search_results', function(req, res) {  //receives search parameter from search_page form
     let search_input = req.query.zipsearch; //assigns search query parameter to search_input variable
     return getResults(search_input) //API query happens here
     .then(function(usda_results) {
          return searchResultsHandler(usda_results);
     })
     .then(function(usda_marketname_results) {
          res.render('search_results.hbs', {
               usda_results: usda_marketname_results//sends results from API call to search_results page
          });
     })
     .catch(function(err){
     console.log("errror calder",err.message);
     });
});


function getResults(search_input) {
     return popsicle.request({
       method: 'GET',
       url: "http://search.ams.usda.gov/farmersmarkets/v1/data.svc/zipSearch?zip=" + search_input,
     })
       .then(function (res) {
          return res.body;
       })
  }

  function searchResultsHandler(searchresults) { //this function handles the JSON returned from USDA API and narrows it down to an array of marketnames
       return (new Promise (function(accept, reject) { //promisifies the function to be part of the promise chain above
            let market_names = [];
            var parsedresults = JSON.parse(searchresults);
            console.log("AAAARON");
            for (var key in parsedresults.results) {
               market_names.push(parsedresults.results[key].marketname);
            }
            console.log(market_names);
            accept(market_names);
       }));
}

//EXPRESS LISTEN FUNCTION BELOW (MUST STAY AT THE BOTTOM OF THE FILE)
app.listen(3000, function() {
  console.log('Listening on port 3000.');
});
