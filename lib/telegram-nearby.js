const { Client } = require('tdl');
const { TDLib } = require('tdl-tdlib-addon');
const { to } = require('await-to-js');
const path = require('path');
const log = require('./logger.js');

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

class TelegramNearby {
    constructor(apiId, apiHash) {
        let root = process.cwd();
        process.chdir('lib/tdlib/');

        let tdLibraryPath = "./libtdjson.so";
        if (process.platform === "win32") {
            tdLibraryPath = "tdjson.dll";
        }

        console.log(`Current WD: ${process.cwd()}`)
        console.log(`Lib Path: ${tdLibraryPath}`)
        this.client = new Client(new TDLib(tdLibraryPath), {
            apiId: apiId,
            apiHash: apiHash,
        });

        process.chdir(root);

        this.client.connectAndLogin();
        this.client.on('error', log.warn);
    }

    async getNearby(position) {
        let err, nearbyChats;
        let result = {};

        [err, nearbyChats] = await to(
            this.client
                .invoke({
                    _: 'searchChatsNearby',
                    location: {
                        latitude: position.lat,
                        longitude: position.lon,
                        horizontal_accuracy: Math.random() * (10.12 - 1.02) + 1.02,
                    },
                })
                .catch((err) => {
                    log.warn(err.stack);
                    return null;
                })
        );

        if (err) {
            log.warn(`searchChatsNearby error: ${err.message}`);
            return null;
        }

        let nearbyUsers = nearbyChats.users_nearby;
        for (let u in nearbyUsers) {
            let user;
            let nearbyUser = nearbyUsers[u];
            let userId = nearbyUser.chat_id;

            result[userId] = { distance: nearbyUser.distance };

            [err, user] = await to(
                this.client.invoke({
                    _: 'getUser',
                    user_id: userId,
                })
            );

            if (user) {
                result[userId].raw = user;
                result[userId].userId = user.user_id;
                result[userId].name = user.first_name + (user.last_name ? (" " + user.last_name) : "");
                result[userId].username = user.username;
            } else {
                log.warn(`getUser error: ${err.message}`);
            }
            if (user && user.profile_photo !== undefined && user.profile_photo.big !== undefined) {
                let photo;

                // poor-mans retry-loop :(
                for (let retry = 0; retry < 5; retry++) {
                    [err, photo] = await to(
                        this.client.invoke({
                            _: 'downloadFile',
                            file_id: user.profile_photo.big.id,
                            priority: 2,
                            offset: 0,
                            limit: 0,
                            synchronous: true,
                        })
                    );

                    if (photo) {
                        result[userId].photo = path.basename(photo.local.path);

                        // get out of this poor-mans retry-loop :(
                        break;
                    } else {
                        log.warn(`downloadFile error (try: ${retry}/5): ${err.message}`);
                    }
                }
            }

            // avoid rate-limiting (?)
            sleep(500);
        }

        return result;
    }
}

module.exports = TelegramNearby;
