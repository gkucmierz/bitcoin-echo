const express = require('express');
const get = require('get');
const {Transaction} = require('bitcore-lib');

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

app.get('/ping', (req, res) => {
  // res.end('pong');
  // bitcoinEcho();

  getUnspents('1HNCGXzr8RtiUB3EGVEaNHsQBW3wJmsWVs')
    .then(unsp => {
      let txHashes = getUniqueTxHashes(unsp);
      let promises = txHashes.map(txHash => {
        return getTransaction(txHash)
          .then(tx => {
            let sender = getSender(tx);
            let filteredUnsp = filterUnspents(unsp, txHash);
            let senderFee = getSendersFee(tx);
            let echoTx = createTransaction(sender, filteredUnsp, senderFee);
            return echoTx;
          })
          .catch(err => res.end(err.toString()));
      });
      Promise.all(promises)
        .then(all => {
          res.end(all.toString());
        })
        .catch(err => res.end(err.toString()));
    })
    .catch(err => res.end(err.toString()));
});

// catch all
app.use((req, res) => {
});


function bitcoinEcho() {
  getUnspents(unspents => {
  });
};

function createTransaction(recipient, unspents, fee) {
  let priv = '';
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
    .sign(priv);
  return tx;
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

function unique(arr) {
  return arr.filter((el, i) => arr.indexOf(el, i+1) === -1);
}

function sum(arr) {
  return arr.reduce((acc, n) => acc + n, 0);
}
