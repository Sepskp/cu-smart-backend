const express = require('express');
const mysql = require('mysql');
const app = express();
const port = process.env.PORT||21 ;
app.use(express.json());

// Connect to MySQL
const con = mysql.createConnection({
  host: "ftp.pcshsptsama.com",
  user: "zp11489",
  password: "PcShSpT04475",
  database: "zp11489_projecta"
});

// /////////////////////////////////////// Frist API/////////////////////////////////////////////////////////////
app.get('/', async (req, res) => {
    let { faculty, department, creationtime } = req.query;
     if (!faculty || !department || !creationtime) {
      // Use the fixed parameters for the SQL queries
      faculty = "Eng";
      department = ["EE","ALL"];
      creationtime = "2022-09-01";
    }
    const CreationTime = new Date(creationtime);
    const CreationTimeString = CreationTime.toISOString().slice(0, 10);
   
    try {
      // Execute the first query to get energy values per hour, categorized by "bld"
      const sqlQuery1 = `
        SELECT bld, DATE_FORMAT(creationtime, "%H:00") as timestart, SUM(energy) as value
        FROM zp11489_projecta.new_lumpsum_data
        WHERE faculty = ? 
        AND department IN (?) 
        AND DATE_FORMAT(creationtime, "%Y-%m-%d") = ?
        GROUP BY bld, DATE_FORMAT(creationtime, "%Y-%m-%d %H:00")
        ORDER BY bld, DATE_FORMAT(creationtime, "%Y-%m-%d %H:00");
      `;
  
      const results1 = await executeQuery(sqlQuery1, [faculty, department, CreationTimeString]);
  
      // Execute the second query to get the sum of energy values for all buildings combined
      const sqlQuery2 = `
        SELECT DATE_FORMAT(creationtime, "%H:00") as timestart, SUM(energy) as value
        FROM zp11489_projecta.new_lumpsum_data
        WHERE faculty = ? 
        AND department IN (?) 
        AND DATE_FORMAT(creationtime, "%Y-%m-%d") = ?
        GROUP BY DATE_FORMAT(creationtime, "%Y-%m-%d %H:00")
        ORDER BY DATE_FORMAT(creationtime, "%Y-%m-%d %H:00");
      `;
  
      const results2 = await executeQuery(sqlQuery2, [faculty, department, CreationTimeString]);
  
      // Format the results and create the final output object
      const energyValuesByBld = {};
      results1.forEach(({ bld, timestart, value }) => {
        if (!energyValuesByBld[bld]) {
          energyValuesByBld[bld] = [];
        }
        energyValuesByBld[bld].push({
          
            timestart,
            value,
            unit: 'Wh'
        
        });
      });
  
      const sumAllBld = results2.reduce((sum, { value }) => sum + value, 0);
      const allBldEnergyValues = results2.map(({ timestart, value}) => ({
        
          timestart,
          value,
          unit: 'Wh'
        
      }));
      const output = {
        allbld: [
            {
              energy_hr: [
                {
                  timestart: "Total",
                  value: sumAllBld,
                  unit: 'Wh'
                },
                ...allBldEnergyValues
              ]
               },
          ],
        eachbld: energyValuesByBld
      
      };
    // Find min and max from energy_hr array
    const energyHrValues = output.allbld[0].energy_hr.map(item => item.value);
    const minEnergyHr = Math.min(...energyHrValues);
    const maxEnergyHr = Math.max(...energyHrValues);
    // Calculate the sum of all energy values
    const sumEnergyHr = energyHrValues.reduce((acc, val) => acc + val, 0);

    // Calculate the average (mean) energy value
    const avgEnergyHr = sumEnergyHr / energyHrValues.length;
      // Add min and max values to the output
      output.allbld[0].min = minEnergyHr;
      output.allbld[0].max = maxEnergyHr;
      output.allbld[0].avg= avgEnergyHr;
      res.json(output);
    } catch (err) {
      console.error('Error executing the query:', err.message);
      res.status(500).json({ error: 'Error executing the query' });
    }
  });
  
  // Function to execute a single query and return a Promise
  function executeQuery(sqlQuery, values) {
    return new Promise((resolve, reject) => {
      con.query(sqlQuery, values, (err, results) => {
        if (err) {
          reject(err);
        } else {
          resolve(results);
        }
      });
    });
  }
// /////////////////////////////////////// Second API /////////////////////////////////////////////////////////////
function executeQuery(query, values) {
  return new Promise((resolve, reject) => {
    con.query(query, values, (error, results) => {
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

async function countUsingStatus(bld, room, fl_no, creationtime, time) {
  try {
    const query = `
      SELECT DISTINCT DATE_FORMAT(creationtime, "%H:00") as timestartbld, monitor, room, sum(energy) AS energy,
        CASE
          WHEN sum(energy) >= 10 THEN 'using'
          ELSE 'Not using' END AS cnt
      FROM cham9
      WHERE bld = ?
        AND room = ?
        AND fl_no = ?
        AND DATE_FORMAT(creationtime, "%Y-%m-%d") = ?
        AND DATE_FORMAT(creationtime, "%H:00") = TIME_FORMAT(DATE_SUB(TIME(?), INTERVAL 1 HOUR), '%H:%i')
      GROUP BY room, monitor, DATE_FORMAT(creationtime, "%H:00")
      ORDER BY monitor ASC;
    `;

    const values = [bld, room, fl_no, creationtime, time];
    const results = await executeQuery(query, values);

    // Count the 'cnt' values
    const avaibleOutlet = results.filter(row => row.cnt === 'using').length;
    const nonavaibleOutlet = results.filter(row => row.cnt === 'Not using').length;
    const totalOutlet = nonavaibleOutlet + avaibleOutlet
    // Calculate the percentage
    const percentage = (avaibleOutlet / (nonavaibleOutlet + avaibleOutlet)) * 100;
 // Determine the label based on the percentage value
 let label;
 if (percentage < 10) {
   label = "empty";
 } else if (percentage < 50) {
   label = "recommend";
 } else if (percentage < 80) {
    label = "Hot";
  }else if (percentage > 80) {
    label = "Full";
  }else {
   label = "No data";
 }

 return { totalOutlet,avaibleOutlet,percentage, label };
} catch (error) {
 throw error;
}
}

app.get("/recommend_cham9", async (request, response) => {
  try {
    // Extract the required parameters from request body or query params
    const { bld, room, fl_no, creationtime, time } = request.body;
    const counts = await countUsingStatus(bld, room, fl_no, creationtime, time);
    response.json(counts);
  } catch (error) {
    response.status(500).json({ error: "An error occurred" });
  }
});
// /////////////////////////////////////// Third API /////////////////////////////////////////////////////////////
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

