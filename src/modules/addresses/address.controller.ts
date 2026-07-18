import type { Request, Response } from "express";
import type { AddressService } from "./address.service.js";
import type { ApiResponse } from "../../shared/types/api-response.js";
import type { CreateAddressInput, UpdateAddressInput } from "./address.schema.js";

export class AddressController {
  constructor(private readonly service: AddressService) {}

  list = async (req: Request, res: Response) => {
    const addresses = await this.service.listByUser(req.user!.id);

    const body: ApiResponse<typeof addresses> = {
      success: true,
      data: addresses,
    };
    res.status(200).json(body);
  };

  create = async (req: Request, res: Response) => {
    const data = req.body as CreateAddressInput;
    const address = await this.service.createAddress(req.user!.id, data);

    const body: ApiResponse<typeof address> = {
      success: true,
      data: address,
    };
    res.status(201).json(body);
  };

  update = async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const data = req.body as UpdateAddressInput;
    const address = await this.service.updateAddress(req.user!.id, id, data);

    const body: ApiResponse<typeof address> = {
      success: true,
      data: address,
    };
    res.status(200).json(body);
  };

  remove = async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    await this.service.deleteAddress(req.user!.id, id);

    const body: ApiResponse<null> = { success: true, data: null };
    res.status(200).json(body);
  };
}
