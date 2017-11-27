'use strict';

//import THREE from './three';
import Delaunator from 'delaunator';
import areaOfPolygon from 'area-polygon';

export default class SectorMap
{
  static side_to_triangle(s) 
  { 
    return (s/3)|0; 
  }
  static side_prev_side(s) { return (s % 3 == 0) ? s+2 : s-1; }
  static side_next_side(s) { return (s % 3 == 2) ? s-2 : s+1; }

  constructor(minimumDistance, genFunc)
  {
    Object.assign(this, {minimumDistance});

    this.pointsArr = null; // TypeArray returned by pointgen
    this.points = null; // PointsArr reformatted for input into Delaunator
    this.delaunay = null; // Delaunator returned object
  
    this.region_verts = null;
    this.side_start_region = null;
    this.side_opposite_side = null;
  
    this.numSides = null;
    this.numRegions = null;
    this.numTriangles = null;
  
    this.regions = null;
  
    // Geometries
    this.pointArrGeometry = null;
    this.delaunayGeometry = null;

    // Area tracking
    this.minArea = Infinity;
    this.maxArea = -Infinity;

    // Create points
    this.pointsArr = genFunc(this.minimumDistance);
    //console.log(this.pointsArr);

    this.numPoints = this.pointsArr.length;
    
    // Create point geometry
    this.pointArrGeometry = new THREE.Geometry();
    for(let i = 0; i < this.numPoints; i+=2)
      this.pointArrGeometry.vertices.push(new THREE.Vector3(this.pointsArr[i], 0, this.pointsArr[i+1]));
    
    // Convert points format for delaunator
    this.points = [];
    for(let i = 0; i < this.numPoints; i+=2)
      this.points.push([this.pointsArr[i], this.pointsArr[i+1]]);

    // Delaunay triangulation
    //console.log("Starting Delaunator");
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
    //console.log(this.delaunayGeometry.vertices);

    // (Start cannibalising RedBlobGames's dual-mesh map generator)
    // Setup tracking variables
    this.region_verts = this.points;
    this.side_start_region = this.delaunay.triangles;
    this.side_opposite_side = this.delaunay.halfedges;

    this.numSides = this.side_start_region.length;
    this.numRegions = this.region_verts.length;
    this.numTriangles = this.numRegions - 1;

    // Construct and index for finding sides connected to a region
    this.region_any_side = new Int32Array(this.numRegions);
    for(let side = 0; side < this.side_start_region.length; side++)
    {
      this.region_any_side[this.side_start_region[side]] = this.region_any_side[this.side_start_region[side]] || side;
    }

    // Construct triangle coordinates
    this.triangle_vertex = new Array(this.numTriangles);
    let circumcenterCounter = 0;
    let centroidCounter = 0;
    //console.log("Processing " + this.side_start_region.length/3 + " triangles...");
    for(let side = 0; side < this.side_start_region.length; side+=3)
    {
      let a = this.region_verts[this.side_start_region[side]],
          b = this.region_verts[this.side_start_region[side+1]],
          c = this.region_verts[this.side_start_region[side+2]];
      
      // Check if circumcentrer is within a scaled down version of the triangle, 
      // if so allow use it, if not use the centroid      
      let centre = this.circumcenter(a[0], a[1], b[0], b[1], c[0], c[1]);
      if(this.ptInScaledTriangle( centre
                            , {x:a[0], y:a[1]}  // Point A
                            , {x:b[0], y: b[1]} // Point B
                            , {x:c[0], y:c[1]}  // Point C
                            , 0.2))             // Scaler
      {
        this.triangle_vertex[side/3] = [centre.x, centre.y];
        circumcenterCounter++;
      }
      else // Calculate the centroid
      {        
        this.triangle_vertex[side/3] = [(a[0] + b[0] + c[0])/3, (a[1] + b[1] + c[1])/3];
        centroidCounter++;
      }
    }
    //console.log(circumcenterCounter + " circumcenters used\n" + centroidCounter + " centroids calculated");
    
    // Create regions, ignoring boundary regions
    this.regions = [];
    for(let region = 0; region < this.numRegions; region++)
    {       
      let verts = this.region_circulate_triangle([], region).map((t) => this.triangle_vertex[t]);
      if(verts.length == 0)
      {
        continue; 
      }
      let cp = this.calculateCentrePoint(verts);
      // Translate vertices by cp
      verts = verts.map((p) => {return [p[0] - cp.x, p[1] - cp.y];});
      let area = areaOfPolygon(verts);
      this.regions.push
      (
        {
          vertices: verts,
          numVertices: ((verts) ? verts.length : 0),
          cp: cp,
          //area: this.calculateAreaOfRegion(verts, cp)
          area: area // Both methods seem to be equal speed-wise
        }
      );
      if(area > this.maxArea) this.maxArea = area;
      if(area < this.minArea) this.minArea = area;
    }

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

    // Construct triangle geometry for regions
    this.regionTriGeometry = [];
    this.regionTriGeometry.length = this.regions.length;
    for(let region = 0; region < this.regions.length; region++)
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
      
      // Because all the vertices are translated by cp, they are all positioned
      // around the origin
      this.regionTriGeometry[region].vertices.push(new THREE.Vector3(
        0,//cp.x,
        0,
        0//cp.y
      ));


      // Connect this centre point with the surrounding vertices
      for(let vi = 0; vi < numVerts; vi++)
      {
        this.regionTriGeometry[region].faces.push(new THREE.Face3(numVerts, (vi+1)%numVerts, vi));
      }

      this.regionTriGeometry[region].computeFaceNormals();
    }
  }

  region_circulate_triangle(out_t, region)
  {
    const side0 = this.region_any_side[region];
    let side = side0;
    out_t.length = 0;
    do
    {
      out_t.push(SectorMap.side_to_triangle(side));
      let s_opp_s = this.side_opposite_side[side];
      if(s_opp_s == -1) 
      {
        // No opposite side, therefore we must be dealing 
        // with a boundary region which we can ignore
        out_t = [];
        break;
      }
      side = SectorMap.side_next_side(s_opp_s);      
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
  ptInScaledTriangle(p, t0, t1, t2, scale) {
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

  calculateRegionCentrePoint(region)
  {
    let xSum = 0;
    let ySum = 0;
    for(let i = 0; i < this.regions[region].vertices.length; i++)
    {
      xSum += this.regions[region].vertices[i][0];
      ySum += this.regions[region].vertices[i][1];
    }

    return {
      x: xSum / this.regions[region].vertices.length,
      y: ySum / this.regions[region].vertices.length
    };
  }

  calculateCentrePoint(verts)
  {
    let xSum = 0;
    let ySum = 0;
    for(let i = 0; i < verts.length; i++)
    {
      xSum += verts[i][0];
      ySum += verts[i][1];
    }

    return {
      x: xSum / verts.length,
      y: ySum / verts.length
    };
  }

  // Totally not lifted from Delaunator... ;)
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
}
