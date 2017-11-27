'use strict';

//import * as THREE from './three';
import Delaunator from 'delaunator';
import areaOfPolygon from 'area-polygon';
import PoissonDiscSampler2D_Polygon from './poissondisc.poly';

export default class SubSectorMap
{
  static side_to_triangle(s) 
  { 
    return (s/3)|0; 
  }
  static side_prev_side(s) { return (s % 3 == 0) ? s+2 : s-1; }
  static side_next_side(s) { return (s % 3 == 2) ? s-2 : s+1; }
  
  ghost_r()     { return this.numRegions - 1; }
  s_ghost(s)    { return s >= this.numSolidSides; }
  t_ghost(t)    { return this.s_ghost(3 * t); }
  r_boundary(r) { return r < this.vertices.length; }
  s_boundary(s) { return this.s_ghost(s) && (s % 3 == 0); }
  //r_ghost(r)    { return r == this.numRegions - 1; }
  //t_ghost(t)    { return this.s_ghost(3 * t); }

  constructor(vertices, minimumDistance, maxPoints, polyScale=0.75, maxTries=30)
  {
    Object.assign(this, {vertices, minimumDistance, maxPoints, polyScale, maxTries});

    //console.log(vertices, minimumDistance, maxPoints, polyScale, maxTries);
    
    this.pointsArr = null; // Point objects returned by PoissonDiscSampler
    this.points = null; // PointsArr reformatted fror Delaunator
    this.delaunay = null; // Object returned by Delaunator

    this.region_verts = null; 
    this.side_start_region = null;
    this.side_opposite_side = null;

    this.numSides = null;
    this.numRegions = null;
    this.numTriangles = null;

    this.regions = null;

    // Geometries
    this.pointArrGeometry = null;
    this.delaunayGeometry = null; // Inconsistent

    // Area tracking
    this.minArea = Infinity;
    this.maxArea = -Infinity;

    // Create Points
    //console.log("Sampling for points");
    do
    {
      this.PoissonDiscSampler = new PoissonDiscSampler2D_Polygon(this.vertices
        , this.minimumDistance
        , this.maxPoints
        , this.polyScale
        , this.maxTries);
      // Add the polygon's vertices to the poisson's pointlist, creating our boundary regions
      this.vertices.forEach((p) => this.PoissonDiscSampler.addPoint(p));   
      // Fill in the polygon with points   
      this.pointsArr = this.PoissonDiscSampler.Sample();
      this.numPoints = this.pointsArr.length;
      //console.log(this.numPoints, this.minimumDistance);
      this.minimumDistance /= 1.25;
    } while(this.numPoints < 6); // Arbitrary minimum number of points, too few and we won't get any real regions

    // Create point geometry
    this.pointArrGeometry = new THREE.Geometry();
    for(let i = 0; i < this.numPoints; i++)
      this.pointArrGeometry.vertices.push(new THREE.Vector3(this.pointsArr[i].x, 0, this.pointsArr[i].y));

    // Convert points format for delaunator
    this.points = [];
    for(let i = 0; i < this.numPoints; i++)
      this.points.push([this.pointsArr[i].x, this.pointsArr[i].y]);

    // Delaunay triangulation
    //console.log("Delaunay Triangulation on points");
    this.delaunay = new Delaunator(this.points);
    //console.log(this.delaunay);

    // Create delaunay geometry
    this.delaunayGeometry = new THREE.Geometry();
    for(let i = 0; i < this.delaunay.triangles.length; i+=3)
    {
      // Point 1
      this.delaunayGeometry.vertices.push(new THREE.Vector3(
                                          this.points[this.delaunay.triangles[i]][0]
                                        , 0
                                        , this.points[this.delaunay.triangles[i]][1]));
      // Point 2
      this.delaunayGeometry.vertices.push(new THREE.Vector3(
                                          this.points[this.delaunay.triangles[i+1]][0]
                                        , 0
                                        , this.points[this.delaunay.triangles[i+1]][1]));
      // Point 3
      this.delaunayGeometry.vertices.push(new THREE.Vector3(
                                          this.points[this.delaunay.triangles[i+2]][0]
                                        , 0
                                        , this.points[this.delaunay.triangles[i+2]][1]));
    }

    // Setup dual-mesh tracking variables
    //console.log("Dual-mesh configuration");
    this.region_verts = this.points;
    this.side_start_region = this.delaunay.triangles;
    this.side_opposite_side = this.delaunay.halfedges;

    // Add ghost structure
    {
      const numSolidSides = this.side_start_region.length;
      const ghost_region = this.region_verts.length;

      let numUnpairedSides = 0, firstUnpairedEdge = -1;
      let region_unpaired_side = [];
      for(let side = 0; side < numSolidSides; side++)
      {
        if(this.side_opposite_side[side] === -1)
        {
          numUnpairedSides++;
          region_unpaired_side[this.side_start_region[side]] = side;
          firstUnpairedEdge = side;
        }
      }

      let polygonCP = this.calculateCentrePoint(this.vertices);
      let region_newvertex = this.region_verts.concat([[polygonCP.x, polygonCP.y]]);
      let side_newstart_region = new Int32Array(numSolidSides + 3 * numUnpairedSides);
      side_newstart_region.set(this.side_start_region);
      let side_newopposite_side = new Int32Array(numSolidSides + 3 * numUnpairedSides);
      side_newopposite_side.set(this.side_opposite_side);

      for(let i = 0, s = firstUnpairedEdge;
          i < numUnpairedSides;
          i++, s = region_unpaired_side[side_newstart_region[SubSectorMap.side_next_side(s)]]) 
      {         
          // Construct a ghose side for s
          let ghost_s = numSolidSides + 3 * i;
          side_newopposite_side[s] = ghost_s;
          side_newopposite_side[ghost_s] = s;
          side_newstart_region[ghost_s] = side_newstart_region[SubSectorMap.side_next_side(s)];

          // Construct the rest of the ghost triangle
          side_newstart_region[ghost_s + 1] = side_newstart_region[s];
          side_newstart_region[ghost_s + 2] = ghost_region;
          let k = numSolidSides + (3 * i + 4) % (3 * numUnpairedSides);
          side_newopposite_side[ghost_s + 2] = k;
          side_newopposite_side[k] = ghost_s + 2;
      }

      this.numSolidSides = numSolidSides;
      this.region_verts = region_newvertex;
      this.side_start_region = side_newstart_region;
      this.side_opposite_side = side_newopposite_side;
    }
    // console.log("this.region_verts", this.region_verts,
    //             "\nthis.side_start_region", this.side_start_region, 
    //             "\nthis.side_opposite_side", this.side_opposite_side);
    //return;

    this.numSides = this.side_start_region.length;
    this.numRegions = this.region_verts.length;
    this.numTriangles = this.numRegions - 1;

    // Construct an index for finding sides connected to a region
    this.region_any_side = new Int32Array(this.numRegions);
    for(let side = 0; side < this.side_start_region.length; side++)
    {
      this.region_any_side[this.side_start_region[side]] = this.region_any_side[this.side_start_region[side]] || side;
    }

    //console.log("Constructing triangle coordinates, centroid and circumcentre selection");
    // Construct triangle coordinates
    this.triangle_vertex = new Array(this.numTriangles);
    for(let side = 0; side < this.side_start_region.length; side+=3)
    {
      let a = this.region_verts[this.side_start_region[side]],
          b = this.region_verts[this.side_start_region[side+1]],
          c = this.region_verts[this.side_start_region[side+2]];
      
      // Check if circumcenter is within a scaled down version of the triangle,
      // if so use it, if not use the centroid
      if(this.s_ghost(side))
      {
        // console.log("ghost side", side, 
        //             "a", this.side_start_region[side], 
        //             "b", this.side_start_region[side+1],
        //             "c", this.side_start_region[side+2]);
        // Ghost triangle coordinates are halfway between a and b
        this.triangle_vertex[side/3] = [(a[0] + b[0])/2, (a[1] + b[1])/2];
      }
      else
      {
        let centre = this.circumcenter(a[0], a[1], b[0], b[1], c[0], c[1]);      
        if(this.ptInScaledTriangle( centre,
                                    {x:a[0], y:a[1]}
                                  , {x:b[0], y:b[1]}
                                  , {x:c[0], x:c[1]}
                                  , 0.2))
        {
          this.triangle_vertex[side/3] = [centre.x, centre.y];
        }
        else // Calculate the centroid
        {
          this.triangle_vertex[side/3] = [(a[0] + b[0] + c[0])/3, (a[1] + b[1] + c[1])/3];
        }
      }
    }

    //console.log("Creating " + this.numRegions + " regions");
    // Create regions, ignoring boundary regions
    this.regions = [];
    for(let region = 0; region < this.numRegions; region++)
    {
      //if(region == this.ghost_r()) continue; // No point making a real region for the ghost region
      let tris = []; // Triangle indexes
      let verts = this.region_circulate_triangle(tris, region).map((t) => this.triangle_vertex[t]);
      //console.log(verts.length);
      if(verts.length == 0)
      {
        //console.error("Discard");
        continue;
      }
      let cp;
      if(this.r_boundary(region))
      {
        let outerVertex = [this.region_verts[region][0], this.region_verts[region][1]];
        // We have to meddle with the order of the verts for a boundary region
        // because they don't form a ring and we can't assume they're in order
        // to make a fan, so we need to sort them by their angle from the outer
        // vertex.
        let vertsWithAngle = verts.slice(0, verts.length).map((p) => {
          return {p:p, angle: (this.getAngle(outerVertex, p))};
        });
        let sortedVerts = vertsWithAngle.sort((p1, p2) => {
          if(p1.angle == p2.angle) return 0; // This would probably mean two points occupying the same point, or on the same vector, which shouldn't happen
          else return (p1.angle < p2.angle) ? -1 : 1;
        });

        // Check the list for a sign change, and if that change was greater than Pi
        // if so, shift the items after the change to the front of the list because
        // they are actually below the rest
        let sign1 = (sortedVerts[0].angle >= 0) ? 1 : -1,
            sign2;
        let place = -1;
        for(let i = 1; i < sortedVerts.length; i++)
        {
          sign2 = (sortedVerts[i].angle >= 0) ? 1 : -1;
          if(sign1 != sign2) // Sign change
          {
            // Check if the difference between points is greater than Pi
            // then we've crossed the boundary for -PI to +PI and will need 
            // to move some points around
            if(sortedVerts[i].angle - sortedVerts[i-1].angle > Math.PI)
            {
              place = i;
              break;
            }
          }
        }
        if(place != -1) // Detected sign change and difference greater than Pi
        {
          let part1 = sortedVerts.slice(0, place);
          let part2 = sortedVerts.slice(place, sortedVerts.length);
          sortedVerts = part2.concat(part1);
        }

        // Remap sortedVerts back to an array of arrays
        verts = sortedVerts.map((p)=>{return p.p;});
        verts.push(outerVertex); // Add the outerVertex to the end of the list
        
        // Although the centre point of the boundary region is often outside the 
        // actual polygon, because we're not using it as a vertex in the mesh
        // it's still safe to use it for translation to the origin and back
        cp = this.calculateCentrePoint(verts);
      }
      else
      {
        cp = this.calculateCentrePoint(verts);
      }
      // Translate vertices by cp
      verts = verts.map((p) => {return [p[0] - cp.x, p[1] - cp.y];});
      let area = areaOfPolygon(verts);
      this.regions.push
      (
        {
          vertices: verts,
          numVertices: ((verts) ? verts.length : 0),
          cp: cp,
          area: area
        }
      );
      if(area > this.maxArea) this.maxArea = area;
      if(area < this.minArea) this.minArea = area;
    }
    this.numRegions = this.regions.length; // Some may have been discarded
    
    //console.log("Constructing line geometry");
    // Construct line geometry for regions
    this.regionLineGeometry = [];
    this.regionLineGeometry.length = this.regions.length;
    for(let region = 0; region < this.regions.length; region++)
    {
      this.regionLineGeometry[region] = new THREE.Geometry();
      for(let vert = 0; vert < this.regions[region].vertices.length; vert++)
      {
        this.regionLineGeometry[region].vertices.push(new THREE.Vector3(
          this.regions[region].vertices[vert][0],
          0,
          this.regions[region].vertices[vert][1]
        ));
      }
      // Return to start
      this.regionLineGeometry[region].vertices.push(new THREE.Vector3(
        this.regions[region].vertices[0][0],
        0,
        this.regions[region].vertices[0][1]
      ));
    }

    //console.log("Constructing tri geometry");
    // Construct triangle geometry for regions
    this.regionTriGeometry = [];
    this.regionTriGeometry.length = this.regions.length;
    for(let region = 0; region < this.regions.length; region++)
    {
      if(!this.r_boundary(region))
      {
        this.regionTriGeometry[region] = new THREE.Geometry();

        // Get the centre point of this region
        let cp = this.regions[region].cp;
        let numVerts = this.regions[region].vertices.length;

        for(let i = 0; i < numVerts; i++)
        {
          this.regionTriGeometry[region].vertices.push(new THREE.Vector3(
            this.regions[region].vertices[i][0],
            0,
            this.regions[region].vertices[i][1]        
          ));
        }      

        this.regionTriGeometry[region].vertices.push(new THREE.Vector3(0, 0, 0));        

        // Connect this centre point with the surrounding vertices
        for(let vi = 0; vi < numVerts; vi++)
        {
          this.regionTriGeometry[region].faces.push(new THREE.Face3(numVerts, (vi+1)%numVerts, vi));
        }
      }
      else  // Boundary region, arbitrary, likely concave, polygon
            // requires some extra triangulation
      {
        this.regionTriGeometry[region] = new THREE.Geometry();
        let numVerts = this.regions[region].vertices.length;

        for(let i = 0; i < numVerts; i++)
        {
          this.regionTriGeometry[region].vertices.push(new THREE.Vector3(
            this.regions[region].vertices[i][0],
            0,
            this.regions[region].vertices[i][1]        
          ));
        }

        for(let i = 0; i < numVerts-2; i++)
        {
          //console.log([numVerts-1, (i+1)%(numVerts-1), i]);
          this.regionTriGeometry[region].faces.push(new THREE.Face3(numVerts-1, (i+1)%(numVerts-1), i));
        }

        // if(region < 6) console.log( "vertices", this.regionTriGeometry[region].vertices,
        //                             "\nfaces", this.regionTriGeometry[region].faces);
      }
      this.regionTriGeometry[region].computeFaceNormals();
    }
  }

  region_circulate_triangle(out_t, region)
  {
    //console.log("Region", region);
    const side0 = this.region_any_side[region];
    let side = side0;
    out_t.length = 0;
    //console.log("side0", side0);
    let steps = 0;
    do
    {
      out_t.push(SubSectorMap.side_to_triangle(side));
      let s_opp_s = this.side_opposite_side[side];
      //console.log(s_opp_s);
      // if(s_opp_s == -1) 
      // {
      //   out_t = [];
      //   break;

      //   // No opposite side, so try the other side of side0
      //   let side = SubSectorMap.side_prev_side(side0);
      //   console.log("s_opp_s == -1, starting reverse search");        
      //   do
      //   {
      //     out_t.unshift(SubSectorMap.side_to_triangle(side));
      //     let s_opp_s = this.side_opposite_side[side];
      //     console.log("side:", side, "new s_opp_s:", s_opp_s);          
      //     if(s_opp_s == -1)
      //     {
      //       // Found the other end of the incomplete polygon
      //       console.log(out_t);
      //       return out_t;
      //     }
      //     side = SubSectorMap.side_prev_side(s_opp_s);
      //   } while(side != side0);
      //   console.log(out_t);
      //   return out_t;
      // }
      side = SubSectorMap.side_next_side(s_opp_s);
      //console.log("side" , side, "s_opp_s", s_opp_s); 
      steps++;
      if(steps == 30) break;
      //console.log(side);    
    } while(side != side0);
    return out_t;
  }

  // Returns true or false if the supplied point (pt) is within the triangle
  // defined by t0, t1, t2
  // Function taken from http://jsfiddle.net/PerroAZUL/zdaY8/1/, originating from https://stackoverflow.com/a/2049712/1941205,
  // with variable names altered, var -> let
  pointInTriangle(pt, t0, t1, t2, AScale)
  {
    let A = 0.5 * (-t1.y * t2.x + t0.y * (-t1.x + t2.x) + t0.x * (t1.y - t2.y) + t1.x * t2.y);
    let sign = A < 0 ? -1 : 1;
    let s = (t0.y * t2.x - t0.x * t2.y + (t2.y - t0.y) * pt.x + (t0.x - t2.x) * pt.y) * sign;
    let t = (t0.x * t1.y - t0.y * t1.x + (t0.y - t1.y) * pt.x + (t1.x - t0.x) * pt.y) * sign;
    return s > 0 && t > 0 && (s+t) < 2 * A * AScale * sign;
  }

  // Returns true or false is the spllied point is within the scaled down triangle defined by the points
  // t0, t1, t2 and the given scale.
  // Function derived from the one above, 
  // a jsfiddle demonstrating how it works can be seen here http://jsfiddle.net/Markyparky56/wt0vu9q5/
  ptInScaledTriangle(p, t0, t1, t2, scale) 
  {
		// Find centroid of full-size triangle
    let centroid = {
    	x: (t0.x + t1.x + t2.x) / 3,
      y: (t0.y + t1.y + t2.y) / 3
    };
    
    // Construct new corners, scaling the triangles points in toward the centroid
    let p0 = this.scalePoint(t0, centroid, scale);
    let p1 = this.scalePoint(t1, centroid, scale);
    let p2 = this.scalePoint(t2, centroid, scale);
		
    var A = 0.5 * (-p1.y * p2.x + p0.y * (-p1.x + p2.x) + p0.x * (p1.y - p2.y) + p1.x * p2.y);
    var sign = A < 0 ? -1 : 1;
    var s = (p0.y * p2.x - p0.x * p2.y + (p2.y - p0.y) * p.x + (p0.x - p2.x) * p.y) * sign;
    var t = (p0.x * p1.y - p0.y * p1.x + (p0.y - p1.y) * p.x + (p1.x - p0.x) * p.y) * sign;
    
    return s > 0 && t > 0 && (s + t) < 2 * A * sign;
  }

  // Helper functions for ptInScaledTriangle
  norm(vec) 
  { 
    let mag = Math.sqrt(vec.x*vec.x + vec.y*vec.y);
    let multiplier = 1/mag;
    return {
      x: vec.x * multiplier,
      y: vec.y * multiplier
    };
  }
  
  scalePoint(a, b, scale)
  {
    let v = {x: b.x - a.x, y: b.y - a.y};
    return {
      x: a.x + (v.x * (1 - scale)),
      y: a.y + (v.y * (1 - scale))
    }
  }

  circumcenter(ax, ay, bx, by, cx, cy) 
  {
    bx -= ax;
    by -= ay;
    cx -= ax;
    cy -= ay;

    var bl = bx * bx + by * by;
    var cl = cx * cx + cy * cy;

    var d = bx * cy - by * cx;

    var x = (cy * bl - by * cl) * 0.5 / d;
    var y = (bx * cl - cx * bl) * 0.5 / d;

    return {
        x: ax + x,
        y: ay + y
    };
  }

  calculateCentrePoint(verts)
  {
    let xSum = 0;
    let ySum = 0;
    if(Array.isArray(verts[0]))
    {    
      for(let i = 0; i < verts.length; i++)
      {
        xSum += verts[i][0];
        ySum += verts[i][1];
      }
    }
    else
    {
      for(let i = 0; i < verts.length; i++)
      {
        xSum += verts[i].x;
        ySum += verts[i].y;
      }
    }

    return {
      x: xSum / verts.length,
      y: ySum / verts.length
    };
  }

  calculateCentroid(p0, p1, p2)
  {
    return [(p0[0] + p1[0] + p2[0])/3, (p0[1] + p1[1] + p2[1])/3];
  }

  areaOfATriangle(A, B, C)
  {
    return (0.5)*((B[0]-A[0])*(C[1]-A[1]) - (C[0]-A[0])*(B[1]-A[1]));
  }

  calculateAreaOfRegion(verts, cp)
  {
    let sum = 0;
    for(let i = 0; i < verts.length; i++)
    {
      sum += this.areaOfATriangle([cp.x, cp.y], verts[i], verts[((i+1)%verts.length)]);
    }
    return sum;
  }

  getAngle(p1, p2)
  {
    return Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
  }
}
