"use client";

import React, { ReactNode } from "react";

export interface DockMenuItem {
  label?: string;
  onClick?: () => void;
  icon?: ReactNode;
  checked?: boolean;
  disabled?: boolean;
  shortcut?: string;
  separator?: boolean;
  items?: DockMenuItem[];
}

export interface DockItemData {
  icon?: ReactNode;
  label?: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
  badge?: number | string | boolean;
  separator?: boolean;
  menu?: DockMenuItem[];
}

export interface DockProps {
  items?: DockItemData[];
  position?: "bottom" | "top" | "left" | "right";
  className?: string;
}

export default function Dock(_props?: DockProps) {
  return null;
}
