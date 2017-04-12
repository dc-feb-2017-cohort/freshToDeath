// function getResults(search_input) {
//     $.ajax({
//         type: "GET",
//         contentType: "application/json; charset=utf-8",
//         // submit a get request to the restful service zipSearch or locSearch.
//         url: "http://search.ams.usda.gov/farmersmarkets/v1/data.svc/zipSearch?zip=" + search_input,
//         dataType: 'jsonp',
//         jsonpCallback: 'searchResultsHandler'
//     });
// }
// iterate through the JSON result object.
// function searchResultsHandler(searchresults) {
//      let market_names = [];
//     for (var i in searchresults.results) {
//         market_names.push(searchresults.results[i].marketname.substr(4, searchresults.results[i].marketname.length));
//     }
//     console.log(market_names);
// }

// getResults(30339); //call the function by passing a zip code as an argument

const popsicle = require('popsicle');
function getResults(search_input) {
     popsicle.request({
       method: 'GET',
       url: "http://search.ams.usda.gov/farmersmarkets/v1/data.svc/zipSearch?zip=" + search_input,
     })
       .then(function (res) {
            console.log(res.results);
     //     console.log(res.status) // => 200
     //     console.log(res.body) //=> { ... }
     //     console.log(res.get('Content-Type')) //=> 'application/json'
       });
  }

  function searchResultsHandler(searchresults) {
       let market_names = [];
      for (var i in searchresults.results) {
          market_names.push(searchresults.results[i].marketname.substr(4, searchresults.results[i].marketname.length));
      }
      console.log(market_names);
  }

  getResults(30339);
