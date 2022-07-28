require("dotenv").config()
const express = require("express");
const socketio = require("socket.io");
const app = express();

app.set("view engine", "ejs");
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.render("index");
});

const server = app.listen(process.env.PORT || 3000, () => {
  console.log("server is running...");
});

// Initialize socket for the server
// const io = socketio(server);

const io = socketio(server,{
    cors: {
            origin: "http://localhost",
            methods: ["GET", "POST"],
            credentials: true,
            transports: ['websocket', 'polling'],
    },
    allowEIO3: true
    });

const normalrooms = io.of('/nmroom')

const randomrooms = io.of('/random')


// default io

io.on("connection", socket => {
  socket.username = "นิรนาม"

  socket.on("change_username", data => {
    socket.username = data.username
  })

  // handle the new message event
  socket.on("new_message", data => {
    console.log("new messsage");
    io.sockets.emit("receive_message", { message: data.message, username: socket.username})
  })

  socket.on('typing', data => {
    socket.broadcast.emit('typing', { username: socket.username })
  })
})

// normalrooms 

normalrooms.on("connection", socket => {
  console.log("New user connected in normal rooms");

  socket.on("disconnect", data => {
    console.log("User disconnect");
  })
  
});


// randomroom
const path = require("path")
const { randomFromTo, randomString } = require("./utils/random")
const expressPinoLogger = require("express-pino-logger")
const logger = require("./logger/logger")

const loggerMiddleware = expressPinoLogger({
    logger,
})
app.use(loggerMiddleware)
let connectedUsers = [] // holds IDs of all connected users
let availableUsers = [] // holds IDs of all available users
let numOfConnectedUsers = 0
let groups = []
let pairedUsers = {
    pairs: []
}

const connectTwoUsers = (socketId) => {
  let otherUserId = availableUsers[randomFromTo(availableUsers.length)]
  while(!otherUserId){
      console.log("pickign again")
      otherUserId = availableUsers[randomFromTo(availableUsers.length)]
  }
  console.log("other user id picked: ",otherUserId)
  randomrooms.emit("get other user id", {
      for: socketId,
      otherUserId 
  })
  randomrooms.emit("get other user id", {
      for: otherUserId,
      otherUserId: socketId 
  })
  let newPair = {
      user1Id: socketId,
      user2Id: otherUserId
  }
  pairedUsers.pairs.push(newPair)
  //remove sended ID from available users
  let otherUserIdx = availableUsers.indexOf(otherUserId)
  availableUsers = availableUsers.filter((id, idx) => {
      if(idx !== otherUserIdx){
          return id
      }
  })
  logger.info("Users paired")
}
// random room system

randomrooms.on("connection", socket => {
    if(socket.handshake.headers.referer.includes("group")){
        return
    }
    logger.info("New socket connection established")
    connectedUsers.push(socket.id) // add socket id to connectedUsers
    numOfConnectedUsers++

    /* io.emit("get number of users", {
        for: socket.id,
        numOfConnectedUsers
    }) */

    if(availableUsers.length > 0){
        connectTwoUsers(socket.id)
    }
    // if there is not any available user add new user to this array
    else{
        availableUsers.push(socket.id)
        console.log("pridane")
        console.log(availableUsers)
    }

    socket.on("send message", data => {
        randomrooms.emit("recieve message", {
            for: data.for,
            message: data.message
        })
    })

    socket.on("disconnect", () => {
        logger.info("User disconnected")
        numOfConnectedUsers--
        connectedUsers = connectedUsers.filter(id => {
            if(socket.id !== id){
                return id
            }
        })
        if(availableUsers.includes(socket.id)){
            availableUsers = availableUsers.filter(id => {
                if(socket.id !== id){
                    return id
                }
            })
        }
        else{
            let isUserPaired = false
            pairedUsers.pairs.map((pair, pairIdx) => {
                if(pair.user1Id === socket.id || pair.user2Id === socket.id){
                    isUserPaired = true
                    console.log("ale no ")
                    let otherUserId = ""
                    if(pair.user1Id === socket.id)
                        otherUserId = pair.user2Id
                    else
                        otherUserId = pair.user1Id
                    randomrooms.emit("other user disconnected", {
                        for: otherUserId,
                        u1: pair.user1Id,
                        u2: pair.user2Id
                    })
                    if(availableUsers.length > 0){
                        connectTwoUsers(otherUserId)
                    }
                    else
                        availableUsers.push(otherUserId)
                    pairedUsers.pairs.splice(pairIdx, 1)
                }
            })
            if(!isUserPaired){
                let deleteGroup = false
                let deleteGroupIdx = 0
                groups.map((group, groupIdx) => {
                    if(group.users.includes(socket.id)){
                        group.users.splice(group.users.indexOf(socket.id), 1)
                        if(group.users.length === 0){
                            deleteGroup = true
                            deleteGroupIdx = groupIdx
                        }
                    }
                })
                if(deleteGroup){
                    groups.splice(deleteGroupIdx, 1)
                }
            }
        }
    })

    socket.on("Create group", data => {
        let newGroupId = randomString(12)
        randomrooms.emit("Admin group id", {
            for: data.owner,
            groupId: newGroupId
        })
        availableUsers.splice(availableUsers.indexOf(socket.id), 1)
        let newGroup = {
            id: newGroupId,
            users: [data.owner]
        }
        groups.push(newGroup)
        pairedUsers.pairs.map((pair, pairIdx) => {
            if(pair.user1Id === socket.id || pair.user2Id === socket.id){
                console.log("ale no ")
                let otherUserId = ""
                if(pair.user1Id === socket.id)
                    otherUserId = pair.user2Id
                else
                    otherUserId = pair.user1Id
                randomrooms.emit("other user disconnected", {
                    for: otherUserId,
                    u1: pair.user1Id,
                    u2: pair.user2Id
                })
                if(availableUsers.length > 0){
                    connectTwoUsers(otherUserId)
                }
                else
                    availableUsers.push(otherUserId)
                pairedUsers.pairs.splice(pairIdx, 1)
            }
        })
    })

    socket.on("Join group", data => {
        let groupExists = false
        let groupId = 0
        groups.map((group, groupIdx) => {
            if(group.id === data.groupId){
                groupExists = true
                groupId = groupIdx
            }
        })
        if(groupExists){
            availableUsers.splice(availableUsers.indexOf(socket.id), 1)
            groups[groupId].users.push(socket.id)
            randomrooms.emit("Join group resolve", {
                for: data.for,
                success: true,
                groupId: data.groupId
            })
            pairedUsers.pairs.map((pair, pairIdx) => {
                if(pair.user1Id === socket.id || pair.user2Id === socket.id){
                    console.log("ale no ")
                    let otherUserId = ""
                    if(pair.user1Id === socket.id)
                        otherUserId = pair.user2Id
                    else
                        otherUserId = pair.user1Id
                    randomrooms.emit("other user disconnected", {
                        for: otherUserId,
                        u1: pair.user1Id,
                        u2: pair.user2Id
                    })
                    if(availableUsers.length > 0){
                        connectTwoUsers(otherUserId)
                    }
                    else
                        availableUsers.push(otherUserId)
                    pairedUsers.pairs.splice(pairIdx, 1)
                }
            })
        }
        else{
            randomrooms.emit("Join group resolve", {
                for: data.for,
                success: false
            })
        }
    })

    socket.on("group message", data => {
        randomrooms.emit("recieve group message", {
            groupId: data.groupId,
            message: data.message,
            from: data.from
        })
    })
});

