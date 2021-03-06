import {NextApiRequest, NextApiResponse} from "next";

import {ClientTenant, ServerTenant} from "~/tenant/types";
import schemas from "~/tenant/schemas";
import api from "~/tenant/api/server";
import sessionApi from "~/session/api/server";
import dates from "~/utils/date";

interface GetRequest extends NextApiRequest {
  query: {
    slug: ClientTenant["slug"];
    secret: string;
  };
}

interface PatchRequest extends NextApiRequest {
  headers: {
    authorization?: string;
  };
  body: {
    tenant: ClientTenant | ServerTenant;
  };
}

interface PostRequest extends NextApiRequest {
  query: {
    slug: ClientTenant["slug"];
  };
  body: {
    email: string;
    password: string;
    secret: string;
  };
}

export default async (req: NextApiRequest, res: NextApiResponse) => {
  // When a GET request is made
  if (req.method === "GET") {
    const {
      // We extract the slug from query
      query: {slug, secret},
    } = req as GetRequest;

    // If we don't have everything we need
    if (secret !== process.env.SECRET) {
      // Return a 304
      return res.status(304).end();
    }

    return (
      api
        // Fetch that tenant from the DB
        .fetch(slug)
        // If found, return it with a 200
        .then((tenant) => res.status(200).json(schemas.client.fetch.cast(tenant)))
        // Otherwise return an error
        .catch(({status, statusText}) => res.status(status).end(statusText))
    );
  }

  // When a POST request is made
  if (req.method === "POST") {
    const {
      // We extract what we need from the body
      body: {email, password, secret},
      // We extract the slug from query
      query: {slug},
    } = req as PostRequest;

    // If we don't have everything we need
    if (!email || !password || !slug || !secret || secret !== process.env.SECRET) {
      // Return a 304
      return res.status(304).end();
    }

    // Store a temp tenant
    const tenant = schemas.server.create.cast({
      // Tenant slug
      slug,
      // Creation date
      createdAt: dates.now,
      // Grace period
      tier: "commercial",
      // 1 week from now
      tierUntil: dates.oneWeekFromNow,
    });

    // Check if its valid (mocking id as we still don't have it)
    if (!schemas.server.fetch.isValidSync({id: "fake-id", ...tenant})) {
      // If its not return a 304
      return res.status(304).end();
    }

    return (
      api
        // Create the tenant
        .create(email, password, tenant)
        // If everything went fine, return a 200
        .then(() => res.status(200).json({success: true}))
        // Otherwise return an error
        .catch(({status, statusText}) => res.status(status).end(statusText))
    );
  }

  // If a PATCH was made
  if (req.method === "PATCH") {
    const {
      // Extract the changes from the body
      body: {tenant},
      // And the token from headers
      headers: {authorization: token},
    } = req as PatchRequest;

    // If we don't have all the data we need
    if (!tenant || !tenant?.id || !tenant?.slug) {
      // Return a 304
      return res.status(304).end();
    }

    // Extract some values from the tenant
    const {id, ...rest} = tenant;

    return (
      sessionApi
        // Verify that the user requesting the changes is the valid one
        .verify(token)
        .then(({uid}) => {
          // If its not, return a 403
          if (uid !== id) return res.status(403).end();

          return (
            api
              // Send that values to the DB
              .update(id, schemas.server.update.cast(rest))
              // If everything is fine, return the tenant along with a 200
              .then(() => res.status(200).json(tenant))
              // Otherwise return a 400
              .catch(() => res.status(400).end("Hubo un error actualizando la tienda"))
          );
        })
        // If thats not the user, return a 401
        .catch(() => res.status(401).end("La sesión expiró, volvé a iniciar sesión para continuar"))
    );
  }

  // If non of the above happend, return a 304
  return res.status(304).end();
};
