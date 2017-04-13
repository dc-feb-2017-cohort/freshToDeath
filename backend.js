// require('any-promise/register/bluebird');
const express = require('express');
const Promise = require('bluebird');
const session = require('express-session');
const pgp = require('pg-promise')({
  promiseLib: Promise
});
const bodyParser = require('body-parser');
const app = express();
const bcrypt = require('bcrypt');
// const config = require('./config.js');
// const db = pgp(config);
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
  resp.render('login.hbs');
});

// app.post('/submit_login', function(req, resp) {
//   var username = req.body.username;
//   var password = req.body.password;
//   db.one(//SQL scheme goes here//)
//   .then(function(result) {
//     return bcrypt.compare(password, result.password);
//   })
//   .then(function(matched) {
//     if (matched) {
//       req.session.loggedInUser = username;
//       resp.redirect('/');
//     } else {
//       resp.redirect('/login');
//     }
//   })
//     .catch(function(err) {
//       resp.redirect('/login');
//   });
// });

app.get('/', function(req, res){ //renders search/home page with search_page template when user requests it
     res.render('search_page.hbs');
});

app.get('/search_results', function(req, res) {  //receives search parameter from search_page form
     let zip_search_input = req.query.zipsearch; //assigns search query parameter to zip_search_input variable
     return getResults(zip_search_input) //API query happens here
     .then(function(usda_results) {
          return searchResultsHandler(usda_results);
     })
     .then(function (usda_marketinfo_results) {
       return arrayOfIDAPICalls(usda_marketinfo_results);
     })
     .then(function(result_of_arrayOfAPICalls){
       return Promise.map(result_of_arrayOfAPICalls,function(each){
         return popsicle.request(each);
       });
     })
      .then(function(market_detail_results) {
        var market_body = market_detail_results.map(function (item){
          return JSON.parse(item.body);
        });
        console.log(market_body);
        res.render('search_results.hbs', {
            //  usda_results: usda_marketinfo_results,
             market_detail_results: market_body//sends results from API call to search_results page
        });
      })
     .catch(function(err){
     console.log("errror Calder: ",err.message);
     });
});

app.get('/signup', function(req, resp) {
  resp.render('signup.hbs');
});

// app.post('/submit_registration', function(req, res, next) {
//   var info = req.body;
//   var username = req.body.username;
//   var email = req.body.email;
//   var password = req.body.password;
//   bcrypt.hash(info.password, 10)
//     .then(function(encryptedPassword) {
//       console.log(encryptedPassword);
//       return db.none(`//SQL schema goes here//)`,
//       [info.username, info.email, encryptedPassword]);
//     })
//     .then(function() {
//       req.session.loggedInUser = info.username;
//       res.redirect('/login');
//     })
//     .catch(next);
// });


function getResults(zip_search_input) {
     return popsicle.request({
       method: 'GET',
       url: "http://search.ams.usda.gov/farmersmarkets/v1/data.svc/zipSearch?zip=" + zip_search_input,
     })
       .then(function (res) {
          return res.body;
       });
  }

  function searchResultsHandler(searchresults) { //this function handles the JSON returned from USDA API and narrows it down to an array of marketnames
       return (new Promise (function(accept, reject) { //promisifies the function to be part of the promise chain above
            let market_info = [];
            var parsedresults = JSON.parse(searchresults);
            // console.log("AAAARON");
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







//     .then(function (res) {
//       let poop = JSON.parse(res.body);
//       arrayOfMarketDetailResults.push(poop);
//       // console.log(arrayOfMarketDetailResults);
//       return arrayOfMarketDetailResults;
//     });
//   });
// }


// arrayOfIDAPICalls([{id: 1002192}, {id: 1002192}]);
// console.log(arrayOfMarketDetailResults);

//EXPRESS LISTEN FUNCTION BELOW (MUST STAY AT THE BOTTOM OF THE FILE)
app.listen(3000, function() {
  console.log('Listening on port 3000.');
});
