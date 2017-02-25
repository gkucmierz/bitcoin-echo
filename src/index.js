const express = require('express');

const app = express();

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log('App now running on port ', port);
});

app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
})

// catch all
app.use((req, res) => {
  res.end('test');
});
