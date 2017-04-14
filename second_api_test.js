function searchResultsHandler(searchresults) { //this function handles the JSON returned from USDA API and narrows it down to an array of marketnames
       return (new Promise (function(accept, reject) { //promisifies the function to be part of the promise chain above
            let market_info = [];
            var parsedresults = JSON.parse(searchresults);
            console.log("AAAARON");
            for (var key in parsedresults.results) {
               market_info.push({"id" : parsedresults.results[key].id, "marketname": parsedresults.results[key].marketname});
            }
            console.log(market_info);
            accept(market_info);
       }));
}


function arrayOfIDAPICalls(marketInfoResults) {
  marketInfoResults.forEach(function (object) {
    return popsicle.request({
      method: 'GET',
      url: "http://search.ams.usda.gov/farmersmarkets/v1/data.svc/zipSearch?zip=" + object.id,
    })
    .then(function (res) {
       return res.body;
    });
  });
}

//////___________________________________________
function getDetails(id) {
    $.ajax({
        type: "GET",
        contentType: "application/json; charset=utf-8",
        // submit a get request to the restful service mktDetail.
        url: "http://search.ams.usda.gov/farmersmarkets/v1/data.svc/mktDetail?id=" + id,
        dataType: 'jsonp',
        jsonpCallback: 'detailResultHandler'
    });
}
//iterate through the JSON result object.
function detailResultHandler(detailresults) {
    for (var key in detailresults) {
        alert(key);
        var results = detailresults[key];
        alert(results['GoogleLink']);
    }
}
