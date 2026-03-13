const { MongoClient } = require("mongodb");

const uri = "mongodb://127.0.0.1:27017";
const dbName = "LKBusRadar";

/* Sri Lankan names */
const firstNames = [
  "Kasun","Nimal","Saman","Dinesh","Chathura","Pradeep","Ruwan",
  "Mahesh","Tharindu","Isuru","Sachintha","Chaminda","Roshan",
  "Dilshan","Janaka","Ravindu","Ashan","Supun","Gayan","Sandun"
];

const lastNames = [
  "Perera","Silva","Fernando","Jayasinghe","Gunawardena","Rajapaksha",
  "Wijesinghe","Karunaratne","Abeysekara","Weerasinghe","Bandara",
  "Ekanayake","Herath","Rathnayake","Senanayake","De Silva"
];

/* Generate random name */
function randomName() {
  const first = firstNames[Math.floor(Math.random() * firstNames.length)];
  const last = lastNames[Math.floor(Math.random() * lastNames.length)];
  return `${first} ${last}`;
}

/* Generate Sri Lankan phone number */
function randomPhone() {
  const prefix = ["070","071","072","074","075","076","077","078"];
  const p = prefix[Math.floor(Math.random() * prefix.length)];
  const num = Math.floor(1000000 + Math.random() * 9000000);
  return `${p}${num}`;
}

/* Generate email */
function generateEmail(name) {
  const base = name.toLowerCase().replace(" ", ".");
  const domains = ["gmail.com","yahoo.com","hotmail.com"];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  return `${base}@${domain}`;
}

/* Generate Sri Lankan NIC */
function generateNIC() {

  // randomly choose old or new NIC
  const type = Math.random() > 0.5 ? "old" : "new";

  if (type === "old") {
    const year = Math.floor(60 + Math.random() * 40); // 1960–1999
    const day = Math.floor(1 + Math.random() * 366).toString().padStart(3, "0");
    const serial = Math.floor(1000 + Math.random() * 9000);
    const letter = Math.random() > 0.5 ? "V" : "X";

    return `${year}${day}${serial}${letter}`;
  }

  // new NIC
  const year = Math.floor(1980 + Math.random() * 25);
  const day = Math.floor(1 + Math.random() * 366).toString().padStart(3, "0");
  const serial = Math.floor(10000 + Math.random() * 90000);

  return `${year}${day}${serial}`;
}

async function populateOwners() {

  const client = new MongoClient(uri);

  try {

    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db(dbName);
    const owners = db.collection("owners");

    const records = await owners.find({ name: "N/A" }).toArray();

    console.log(`Updating ${records.length} owners`);

    for (const owner of records) {

      const name = randomName();

      await owners.updateOne(
        { _id: owner._id },
        {
          $set: {
            name: name,
            phone: randomPhone(),
            email: generateEmail(name),
            nic: generateNIC(),
            updatedAt: new Date()
          }
        }
      );

    }

    console.log("Owners updated successfully");

  } catch (err) {

    console.error(err);

  } finally {

    await client.close();

  }

}

populateOwners();