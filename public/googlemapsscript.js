function initMap() {

  var map = new google.maps.Map(document.getElementById('map'), {
    zoom: 11,
    center: {lat: center.lat, lng: center.lng}
  });

  // Create an array of alphabetical characters used to label the markers.
  var labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  // Add some markers to the map.
  // Note: The code uses the JavaScript Array.prototype.map() method to
  // create an array of markers based on a given "locations" array.
  // The map() method here has nothing to do with the Google Maps API.
  var markers = locations.map(function(location, i) {
    return new google.maps.Marker({
      position: new google.maps.LatLng(location[0],location[1]),
      label: labels[i % labels.length],
      map: map
    });
  });
}
