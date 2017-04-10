function getResults(zip) {
    $.ajax({
        type: "GET",
        contentType: "application/json; charset=utf-8",
        // submit a get request to the restful service zipSearch or locSearch.
        url: "http://search.ams.usda.gov/farmersmarkets/v1/data.svc/zipSearch?zip=" + zip,
        dataType: 'jsonp',
        jsonpCallback: 'searchResultsHandler'
    });
}
// iterate through the JSON result object.
function searchResultsHandler(searchresults) {
    for (var key in searchresults.results) {
        console.log("Market: ", searchresults.results[key]);
    }
}

getResults(30308); //call the function by passing a zip code as an argument
