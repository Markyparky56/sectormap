import QuadTree from './QuadTree';

export default function genPoints(num, radius, minimumDistance, numBoundaryPoints, weightFunc)
{
  let points = new Float32Array(num*2);
  let discardedPoints = [];
  let quadtree = new QuadTree({
    x: 0, y: 0,
    width: radius*2, height: radius*2
  }, true); // True for pointQuad
  let iter = 0;

  console.log("Generating points");

  for(let i = 0, n = 0; n < numBoundaryPoints; i+=2, n++)
  {
    let x, y;
    let step = (2*Math.PI)/numBoundaryPoints;
    let angle = step*n;

    x = Math.sin(angle) * radius;
    y = Math.cos(angle) * radius;

    points[i] = x;
    points[i+1] = y;
    quadtree.insert({x:x, y:y});
  }

  // force 0,0
  points[numBoundaryPoints*2] = 0;
  points[numBoundaryPoints*2 + 1] = 0;
  quadtree.insert({x:0, y:0});
  
  for(let i = (numBoundaryPoints*2)+2; i < num*2; i+=2)
  {
    let x, y;
    let goodPoint = true;
    let tries = 0; let maxRetries = 42;
    let regenAngle = true;
    let regenRadius = true;  
    let rnd1, rnd2;  
    do
    {
      iter++;
      goodPoint = true;
      // Get random number for angle
      if(regenAngle) rnd1 = Math.random();
      // Get random number for radius
      if(regenRadius) rnd2 = Math.random();

      // Convert rnd1 to angle in radians
      let angle = rnd1 * (2*Math.PI);
      
      // Convert rnd2 to radius
      let r = weightFunc(rnd2) * radius

      // Convert angle and radius to x,y points around the origin
      x = Math.sin(angle) * r;
      y = Math.cos(angle) * r;

      // Check the tree if there are any points too close to the insertion point
      let items = quadtree.retrieve({x:x, y:y})
      // console.log("Points near point " + i/2 + ":");
      // console.log(items);
      if(items.length)
      {
        for(let j = 0; j < items.length; j++)
        {
          // Check distance, if less than minimumDistance, discard the point and try again
          let dx, dy;
          dx = items[j].x - x;
          dy = items[j].y - y;
          let dist = Math.sqrt(dx*dx + dy*dy);
          if(dist < minimumDistance)
          {
            // console.log(
            //   {
            //     msg: "dist < minimumDistance"
            //   , try: tries
            //   , dx:dx
            //   , dy:dy
            //   , p: items[j]
            //   , q: {x:x, y:y}
            //   , dist:dist
            //   , i:i
            //   , j:j
            //   , regenAngle:regenAngle
            //   , regenRadius:regenRadius
            //   }
            // );
            goodPoint = false;            
            tries++;
            break;
          }
          if(!goodPoint) break;
        }
      }

      if(!goodPoint)
      {
        // if(tries > maxRetries) 
        // {
        //   console.log("max tries reached!"); 
        //   discardedPoints.push(i);
        //   break;
        // }
        // else
        {
          if(tries == 0)
          {
            //console.log("First retry, regenerating angle")
            regenRadius = false;
          }
          else
          {
            regenAngle = !regenAngle;
            regenRadius = !regenRadius;
            //console.log(i/2 +": Regenerating: " + ((regenAngle) ? "angle" : "radius"));          
          }
        }
      }
    } while(!goodPoint);
    if(goodPoint)
    {
      points[i] = x;
      points[i+1] = y;
      quadtree.insert({x:x, y:y});
    }    
  }
  console.log("done");
  console.log(discardedPoints);
  return points;
}
