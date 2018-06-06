'use strict';

const bitcoin = require('bitcoin');

let Regex = require('regex'),
  config = require('config'),
  spamchannels = config.get('moderation').botspamchannels;
let walletConfig = config.get('ftc').config;
let paytxfee = config.get('ftc').paytxfee;
const ftc = new bitcoin.Client(walletConfig);

exports.commands = ['tipftc'];
exports.tipftc = {
  usage: '<subcommand>',
  description:
    '__**Feathercoin (FTC) Tipper**__\nTransaction Fees: **' + paytxfee + '**\n    **!tipftc** : Displays This Message\n    **!tipftc balance** : get your balance\n    **!tipftc deposit** : get address for your deposits\n    **!tipftc withdraw <ADDRESS> <AMOUNT>** : withdraw coins to specified address\n    **!tipftc <@user> <amount>** :mention a user with @ and then the amount to tip them\n    **!tipftc private <user> <amount>** : put private before Mentioning a user to tip them privately.\n\n    has a default txfee of ' + paytxfee,
  process: async function(bot, msg, suffix) {
    let tipper = msg.author.id.replace('!', ''),
      words = msg.content
        .trim()
        .split(' ')
        .filter(function(n) {
          return n !== '';
        }),
      subcommand = words.length >= 2 ? words[1] : 'help',
      helpmsg =
        '__**Feathercoin (FTC) Tipper**__\nTransaction Fees: **' + paytxfee + '**\n    **!tipftc** : Displays This Message\n    **!tipftc balance** : get your balance\n    **!tipftc deposit** : get address for your deposits\n    **!tipftc withdraw <ADDRESS> <AMOUNT>** : withdraw coins to specified address\n    **!tipftc <@user> <amount>** :mention a user with @ and then the amount to tip them\n    **!tipftc private <user> <amount>** : put private before Mentioning a user to tip them privately.\n\n    **<> : Replace with appropriate value.**',
      channelwarning = 'Please use <#bot-spam> or DMs to talk to bots.';
    switch (subcommand) {
      case 'help':
        privateorSpamChannel(msg, channelwarning, doHelp, [helpmsg]);
        break;
      case 'balance':
        doBalance(msg, tipper);
        break;
      case 'deposit':
        privateorSpamChannel(msg, channelwarning, doDeposit, [tipper]);
        break;
      case 'withdraw':
        privateorSpamChannel(msg, channelwarning, doWithdraw, [tipper, words, helpmsg]);
        break;
      default:
        doTip(bot, msg, tipper, words, helpmsg);
    }
  }
};

function privateorSpamChannel(message, wrongchannelmsg, fn, args) {
  if (!inPrivateorSpamChannel(message)) {
    message.reply(wrongchannelmsg);
    return;
  }
  fn.apply(null, [message, ...args]);
}

function doHelp(message, helpmsg) {
  message.author.send(helpmsg);
}

function doBalance(message, tipper) {
  ftc.getBalance(tipper, 1, function(err, balance) {
    if (err) {
      message.reply('Error getting Feathercoin (FTC) balance.').then(message => message.delete(10000));
    } else {
      message.reply('You have **' + balance + '** Feathercoin (FTC)');
      const embedAddress = {
      title: '**:bank::money_with_wings::moneybag:Feathercoin (FTC) Balance!:moneybag::money_with_wings::bank:**',
      color: 1363892,
      fields: [
        {
          name: '__User__',
          value: '**' + message.author.username + '**',
          inline: true
        },
        {
          name: '__Balance__',
          value: balance,
          inline: true
        }
      ]
    };
    message.channel.send({ embedAddress });
    }
  });
}

function doDeposit(message, tipper) {
  getAddress(tipper, function(err, address) {
    if (err) {
      message.reply('Error getting your Feathercoin (FTC) deposit address.').then(message => message.delete(10000));
    } else {
      const embedBalance = {
      title: '**:bank::card_index::moneybag:Feathercoin (FTC) Address!:moneybag::card_index::bank:**',
      color: 1363892,
      fields: [
        {
          name: '__User__',
          value: '**' + message.author.username + '**',
          inline: true
        },
        {
          name: '__Address__',
          value: '[' + address + '](https://explorer.feathercoin.com/address/' + address + ')',
          inline: true
        }
      ]
    };
    message.channel.send({ embedBalance });
    }
  });
}

function doWithdraw(message, tipper, words, helpmsg) {
  if (words.length < 4) {
    doHelp(message, helpmsg);
    return;
  }

  var address = words[2],
    amount = getValidatedAmount(words[3]);

  if (amount === null) {
    message.reply("I don't know how to withdraw that much Feathercoin (FTC)...").then(message => message.delete(10000));
    return;
  }

  ftc.getBalance(tipper, 1, function(err, balance) {
    if (err) {
      message.reply('Error getting Feathercoin (FTC) balance.').then(message => message.delete(10000));
    } else {
      if (Number(amount) + Number(paytxfee) > Number(balance)) {
        msg.channel.send('Please leave atleast ' + paytxfee + ' Feathercoin (FTC) for transaction fees!');
        return;
      }
      ftc.sendFrom(tipper, address, Number(amount), function(err, txId) {
        if (err) {
          message.reply(err.message).then(message => message.delete(10000));
        } else {
          const embedWithdraw = {
          title: '**:outbox_tray::money_with_wings::moneybag:Feathercoin (FTC) Transaction Completed!:moneybag::money_with_wings::outbox_tray:**',
          color: 1363892,
          fields: [
            {
              name: '__Withdrew__',
              value: '**' + amount + ' FTC**',
              inline: true
            },
            {
              name: '__Address__',
              value: '[' + address + '](https://explorer.feathercoin.com/address/' + address + ')',
              inline: true
            },
            {
              name: '__Fee__',
              value: '**' + paytxfee + '**',
              inline: true
            },
            {
              name: '__txid__',
              value: '(' + txid + ')[' + txLink(txid) + ']',
              inline: true
            }
          ]
        };
        message.channel.send({ embedWithdraw });
      }
    });
    }
  });
}

function doTip(bot, message, tipper, words, helpmsg) {
  if (words.length < 3 || !words) {
    doHelp(message, helpmsg);
    return;
  }
  var prv = false;
  var amountOffset = 2;
  if (words.length >= 4 && words[1] === 'private') {
    prv = true;
    amountOffset = 3;
  }

  let amount = getValidatedAmount(words[amountOffset]);

  if (amount === null) {
    message.reply("I don't know how to tip that much Feathercoin (FTC)...").then(message => message.delete(10000));
    return;
  }

  ftc.getBalance(tipper, 1, function(err, balance) {
    if (err) {
      message.reply('Error getting Feathercoin (FTC) balance.').then(message => message.delete(10000));
    } else {
      if (Number(amount) + Number(paytxfee) > Number(balance)) {
        msg.channel.send('Please leave atleast ' + paytxfee + ' Feathercoin (FTC) for transaction fees!');
        return;
      }

      if (!message.mentions.users.first()){
           message
            .reply('Sorry, I could not find a user in your tip...')
            .then(message => message.delete(10000));
            return;
          }
      if (message.mentions.users.first().id) {
        sendFTC(bot, message, tipper, message.mentions.users.first().id.replace('!', ''), amount, prv);
      } else {
        message.reply('Sorry, I could not find a user in your tip...').then(message => message.delete(10000));
      }
    }
  });
}

function sendFTC(bot, message, tipper, recipient, amount, privacyFlag) {
  getAddress(recipient.toString(), function(err, address) {
    if (err) {
      message.reply(err.message).then(message => message.delete(10000));
    } else {
          ftc.sendFrom(tipper, address, Number(amount), 1, null, null, function(err, txId) {
              if (err) {
                message.reply(err.message).then(message => message.delete(10000));
              } else {
                if (privacyFlag) {
                  let userProfile = message.guild.members.find('id', recipient);
                    const embedTipReciever = {
                    title: '**:money_with_wings::moneybag:Feathercoin (FTC) Transaction Completed!:moneybag::money_with_wings:**',
                    description: ':confetti_ball::heart_eyes::moneybag::money_with_wings::money_mouth: You got privately **Tipped  __' + amount + '__** :money_mouth: :money_with_wings::moneybag::heart_eyes::confetti_ball:',
                    color: 1363892,
                    fields: [
                      {
                        name: '__txid__',
                        value: '(' + txid + ')[' + txLink(txid) + ']',
                        inline: true
                      }
                    ]
                  };
                  userProfile.user.send({ embedTipReciever });
                  const embedTipSender = {
                  title: '**:money_with_wings::moneybag:Feathercoin (FTC) Transaction Completed!:moneybag::money_with_wings:**',
                  description: ':confetti_ball::heart_eyes::moneybag::money_with_wings::money_mouth:<@' + msg.author.username + '> **Tipped  ' + amount + ' FTC** to <@' + recipient + '>:money_mouth: :money_with_wings::moneybag::heart_eyes::confetti_ball:',
                  color: 1363892,
                  fields: [
                    {
                      name: '__Fee__',
                      value: '**' + paytxfee + '**',
                      inline: true
                    },
                    {
                      name: '__txid__',
                      value: '(' + txid + ')[' + txLink(txid) + ']',
                      inline: true
                    }
                  ]
                };
                message.author.send({ embedTipSender });
                  if (
                    message.content.startsWith('!tipftc private ')
                  ) {
                    message.delete(1000); //Supposed to delete message
                  }
                } else {
                    const embedTip = {
                    title: '**:money_with_wings::moneybag:Feathercoin (FTC) Transaction Completed!:moneybag::money_with_wings:**',
                    description: ':confetti_ball::heart_eyes::moneybag::money_with_wings::money_mouth:<@' + msg.author.username + '> **Tipped  ' + amount + ' FTC** to <@' + recipient + '>:money_mouth: :money_with_wings::moneybag::heart_eyes::confetti_ball:',
                    color: 1363892,
                    fields: [
                      {
                        name: '__Fee__',
                        value: '**' + paytxfee + '**',
                        inline: true
                      },
                      {
                        name: '__txid__',
                        value: '(' + txid + ')[' + txLink(txid) + ']',
                        inline: true
                      }
                    ]
                  };
                  message.channel.send({ embedTip });
                }
              }
            });
    }
  });
}

function getAddress(userId, cb) {
  ftc.getAddressesByAccount(userId, function(err, addresses) {
    if (err) {
      cb(err);
    } else if (addresses.length > 0) {
      cb(null, addresses[0]);
    } else {
      ftc.getNewAddress(userId, function(err, address) {
        if (err) {
          cb(err);
        } else {
          cb(null, address);
        }
      });
    }
  });
}

function inPrivateorSpamChannel(msg) {
  if (msg.channel.type == 'dm' || isSpam(msg)) {
    return true;
  } else {
    return false;
  }
}

function isSpam(msg) {
  return spamchannels.includes(msg.channel.id);
};


function getValidatedAmount(amount) {
  amount = amount.trim();
  if (amount.toLowerCase().endsWith('ftc')) {
    amount = amount.substring(0, amount.length - 3);
  }
  return amount.match(/^[0-9]+(\.[0-9]+)?$/) ? amount : null;
}

function txLink(txId) {
  return 'https://explorer.feathercoin.com/tx/' + txId;
}
