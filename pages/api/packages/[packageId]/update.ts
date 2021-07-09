import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../../lib/prisma";
import type { Package } from "types/package";
import { version } from "process";
import { Prisma } from "@prisma/client";

export default async (req: NextApiRequest, res: NextApiResponse) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.substr("token ".length);

  const packageReq = req.body.packageDef;
  const packageId = req.query.packageId;

  // Some level of auth using a token
  // TODO improve this 
  const publisher = await prisma.publisher.findFirst({
    where: {
      token: String(token),
    },
    include: {
      packages: {
        where: {
          identifier: String(packageId),
        },
      },
    },
  });

  if (publisher) {

    // Determine dependencies 
    // TODO improve this ? 
    let dependencies: Prisma.Enumerable<Prisma.PackageVersionWhereUniqueInput> =
    await Promise.all(
      packageReq.dependencies.map(
        async (d: { id: string; version: string }) => {
          const p = await prisma.package.findFirst({
            where: { identifier: d.id },
          });
          return {
            packageVersionId: {
              version: d.version,
              packageIndex: p?.index,
            },
          };
        }
      )
    );

    if (publisher.packages.length > 0) {
      // Update package information
      let packageUpdate: Prisma.PackageUpdateInput = {
        name: packageReq.name,
        description: packageReq.description,
        readme: "",
        url: packageReq.url,
        docUrl: packageReq.docUrl,
        published: true,
        tags: {
          connectOrCreate: packageReq.tags.map((m: String) => {
            return {
              create: { name: m },
              where: { name: m },
            };
          }),
        },
      };
      const packageNewResult = await prisma.package.update({
        where: {
          index: publisher.packages[0].index,
        },
        data: packageUpdate,
      });

      

      // Update or create package version
      const packageVersionUpdateResult = await prisma.packageVersion.upsert({
        where: {
          packageVersionId: {
            version: packageReq.version,
            packageIndex: publisher.packages[0].index,
          },
        },
        update: {
          sourceUrl: packageReq.sourceUrl,
          checksum: packageReq.checksum,
          version: packageReq.version,
          published: true,
          dependencies: {
            connect: dependencies,
          },
          parameters: {
            connectOrCreate: packageReq.parameters.map(
              (m: { name: string; required: boolean; defaultValue: string }) => {
                return {
                  create: { name: m.name, required: m.required, defaultValue: m.defaultValue },
                  where: {
                    nameRequired: { name: m.name, required: m.required, defaultValue: m.defaultValue },
                  },
                };
              }
            ),
          },
        },
        create: {
          package: { connect: { index: publisher.packages[0].index } },
          sourceUrl: packageReq.sourceUrl,
          checksum: packageReq.checksum,
          version: packageReq.version,
          published: true,
          dependencies: {
            connect: dependencies,
          },
          parameters: {
            connectOrCreate: packageReq.parameters.map(
              (m: { name: string; required: boolean; defaultValue: string }) => {
                return {
                  create: { name: m.name, required: m.required, defaultValue: m.defaultValue },
                  where: {
                    nameRequired: { name: m.name, required: m.required, defaultValue: m.defaultValue },
                  },
                };
              }
            ),
          },
        },
      });

      res
        .status(200)
        .json({ success: true, message: "Updated existing package" });
    } else {
      // check if package publisher not allowed
      const existingPackage = await prisma.package.findMany({
        where: {
          identifier: String(packageId),
        },
      });

      if (existingPackage.length > 0) {
        res.status(401).json({
          success: false,
          message: "You are not authorised to modify this package",
        });
      } else {
        // create new package for this

        let packageCreate: Prisma.PackageCreateInput = {
          name: packageReq.name,
          description: packageReq.description,
          readme: "",
          identifier: String(packageId),
          url: packageReq.url,
          docUrl: packageReq.docUrl,
          type: packageReq.type,
          published: true,
          publisher: {
            connect: {
              index: publisher.index,
            },
          },
          tags: {
            connectOrCreate: packageReq.tags.map((m: String) => {
              return {
                create: { name: m },
                where: { name: m },
              };
            }),
          },
          versions: {
            create: [
              {
                sourceUrl: packageReq.sourceUrl,
                checksum: packageReq.checksum,
                version: packageReq.version,
                published: true,
                dependencies: {
                  connect: dependencies,
                },
                parameters: {
                  connectOrCreate: packageReq.parameters.map(
                    (m: { name: string; required: boolean; defaultValue: string }) => {
                      return {
                        create: { name: m.name, required: m.required, defaultValue: m.defaultValue },
                        where: {
                          nameRequired: { name: m.name, required: m.required, defaultValue: m.defaultValue },
                        },
                      };
                    }
                  ),
                },
              },
            ],
          },
        };

        const packageNewResult = await prisma.package.create({
          data: packageCreate,
        });

        res.status(200).json({
          success: true,
          message: "Created new package",
          p: packageReq,
          n: packageNewResult,
        });
      }
    }
  } else {
    res.status(404).json({
      packageId: String(packageId),
    });
  }
};