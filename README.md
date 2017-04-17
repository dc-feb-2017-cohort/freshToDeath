GetFresh, a web app helping shoppers find pop-up farmers markets.

Contributors: Blake Bagwell, Calder Marshall, Steven Rodriguez, Aaron White.

Description:

This app makes use of a United States Department of Agriculture API to populate a list of farmers markets, based upon a zip code entered by a user.  The Google maps API was implemented to make this possible.  Currently, it is only local to the United States.  In addition, a list of items that are typically available for sale at each individual market is included.  Visitors to GetFresh can also make use of a search function that takes ingredients as values and returns recipes for dishes based upon what they have or are planning to purchase at market.  

Challenges:
This project produced a number of challenges, all varying in intensity.  Calling the USDA API had to be done in two steps, and the results had to be formatted so that they could be rendered on the page.  Extracting each key value pair as well as the gps coordinates from the USDA api proved to be very difficult.  An immense amount of time was spent figuring out the correct way to pass these values to the front end.

Technologies Used:

Express, HTML, CSS, Handlebars, Bootstrap, Javascript, jQuery, Node.js, NPM, GeoJSON, SQL



**DigitalCrafts February 2017 Cohort Group Project 1**
