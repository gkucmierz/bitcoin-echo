const express = require('express');
const get = require('get');
const {Transaction, PrivateKey} = require('bitcore-lib');
const MongoClient = require('mongodb').MongoClient;
const request = require('request');

const app = express();

const port = process.env.PORT || 3000;

const store = {
  privkey: null,
  loaded: false
};

const db = process.env.MONGODB_URI || 'mongodb://192.168.99.100:32768/exampleDb';

// Connect to the db
MongoClient.connect(db, (err, db) => {
  if (err) return console.dir(err);

  let collection = db.collection('data');
  // collection.remove();

  collection.findOne({}, (err, item) => {
    if (err) return;
    if (item) {
      store.privkey = item.value;
      console.log('privkey loaded');
    }
    store.loaded = true;
  });

  console.log('connect db');
});

const setPrivkey = privkey => {
  return new Promise((resolve, reject) => {
    if (store.privkey) reject(Error('Privkey is set already'));
    if (!store.loaded) reject(Error('Store not loaded yet'));

    MongoClient.connect(db, (err, db) => {
      if (err) reject(err);
      let collection = db.collection('data');
      collection.insert({value: privkey}, (err, result) => {
        if (err) reject(err);
        store.privkey = privkey;
        resolve(JSON.stringify(result));
      });
    });
  });
};


app.listen(port, () => {
  console.log('App now running on port ', port);
});

app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
})

app.get('/privkey/:privkey', (req, res) => {
  setPrivkey(req.params.privkey)
    .then(db => res.end(db.toString()))
    .catch(err => res.end(err.toString()));
});

app.get('/address', (req, res) => {
  if (store.privkey) {
    res.end(getAddress(store.privkey));
  } else {
    res.end('address not set');
  }
});

app.get('/ping', (req, res) => {
  // force echo function immediately
  bitcoinEcho()
    .then(all => res.end(all.toString()))
    .catch(err => res.end(err.toString()));
});

// catch all
app.use((req, res) => {
  res.end('not found');
});

(function loop() {
  // call every 5 minutes
  setTimeout(loop, 5 * 60e3);
  bitcoinEcho();
}());


function bitcoinEcho() {
  if (!store.privkey) {
    return new Promise((resolve, reject) => {
      reject('address is not set yet');
    });
  }
  return getUnspents(getAddress(store.privkey))
    .then(unsp => {
      let txHashes = getUniqueTxHashes(unsp);
      let promises = txHashes.map(txHash => {
        return getTransaction(txHash)
          .then(tx => {
            let sender = getSender(tx);
            let filteredUnsp = filterUnspents(unsp, txHash);
            let senderFee = getSendersFee(tx);
            let echoTx = createTransaction(sender, filteredUnsp, senderFee);
            pushTx(echoTx);
            return echoTx;
          })
          .catch(err => {
            throw err;
          });
      });
      return Promise.all(promises);
    });
};

function createTransaction(recipient, unspents, fee) {
  let tx = new Transaction()
    .from(unspents.map(u => {
      return {
        txId: u.tx_hash_big_endian,
        outputIndex: u.tx_output_n,
        address: recipient,
        script: u.script,
        satoshis: u.value
      };
    }))
    .change(recipient)
    .fee(fee)
    .sign(store.privkey);
  return tx;
}

function getAddress(privkey) {
  return PrivateKey.fromWIF(privkey).toAddress().toString();
}

function filterUnspents(unspents, txHash) {
  return unspents.filter(item => item['tx_hash_big_endian'] === txHash);
}

function getUniqueTxHashes(unspents) {
  return unique(unspents.map(u => u['tx_hash_big_endian']));
}

function getSender(txJson) {
  return txJson.inputs[0]['prev_out'].addr;
}

function getSendersFee(txJson) {
  let inputsSum = sum(txJson.inputs.map(i => i['prev_out'].value));
  let outSum = sum(txJson.out.map(i => i.value));
  return inputsSum - outSum;
}

function getUnspents(address) {
  let url = `https://blockchain.info/pl/unspent?active=${address}`;
  return new Promise((resolve, reject) => {
    get(url).asBuffer((err, buf) => {
      if (err) {
        reject(err);
      }
      try {
        resolve(JSON.parse(buf.toString())['unspent_outputs']);
      } catch (e) {
        resolve([]);
      }
    });
  });
}

function getTransaction(txHash) {
  let url = `https://blockchain.info/pl/rawtx/${txHash}`;
  return new Promise((resolve, reject) => {
    get(url).asBuffer((err, buf) => {
      if (err) {
        reject(err);
      }
      let str = buf.toString();
      try {
        resolve(JSON.parse(str));
      } catch (e) {
        reject(str);
      }
    });
  });
}

function pushTx(hex) {
  let url = 'http://btc.blockr.io/api/v1/tx/push';
  return new Promise((resolve, reject) => {
    request.post({url, form: {hex}}, (err, httpResponse, body) => {
      if (err) reject(err);
      resolve(body);
    });
  });
}

function unique(arr) {
  return arr.filter((el, i) => arr.indexOf(el, i+1) === -1);
}

function sum(arr) {
  return arr.reduce((acc, n) => acc + n, 0);
}
