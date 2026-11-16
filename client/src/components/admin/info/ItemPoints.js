import React from 'react';
import InfoPage from '../../common/InfoPage';
import { getItemRates, createItem, updateItem, deleteItem } from '../../../services/performanceApi';
import { ITEM_REVIEW_CHANGED } from '../../../hooks/usePendingItemReviews';

// Information > Item: the item name and the points an employee earns per
// delivered unit. The list fills itself from order lines: a new item starts at
// 0 points and is highlighted until an admin saves it (Edit, then Save Changes).
// An item earns 0 until it is reviewed. Changes apply to orders completed from
// now on; points already earned never change.

const ReviewBadge = () => (
  <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Needs review</span>
);

const tableColumns = [
  { key: 'ItemName', label: 'Item', render: item => <span>{item.ItemName}{item.NeedsReview && <ReviewBadge />}</span> },
  { key: 'PointsPerItem', label: 'Point per item', render: item => (
    <span className={item.NeedsReview ? 'font-semibold text-amber-800' : undefined}>{item.PointsPerItem}</span>
  ) },
];

const formFields = [
  { key: 'ItemName', label: 'Item name', required: true },
  { key: 'PointsPerItem', label: 'Point per item', type: 'number', required: true },
];

const initialState = { ItemName: '', PointsPerItem: '' };

const normalizeItem = item => ({ id: item.id, ItemName: item.item_name, PointsPerItem: item.points_per_item, NeedsReview: item.needs_review });
const toApiFormat = item => ({ item_name: item.ItemName, points_per_item: item.PointsPerItem });

// InfoPage sorts by asking the data source; the list is small, so sort here.
// With no column chosen, items waiting for review come first.
async function getData({ sortBy, sortOrder } = {}) {
  const { items } = await getItemRates();
  const key = { ItemName: 'item_name', PointsPerItem: 'points_per_item' }[sortBy];
  const direction = sortOrder === 'desc' ? -1 : 1;
  const byName = (a, b) => a.item_name.localeCompare(b.item_name);
  return [...items].sort((a, b) => {
    if (!key) return (b.needs_review - a.needs_review) || byName(a, b);
    const order = typeof a[key] === 'number' ? a[key] - b[key] : String(a[key]).localeCompare(String(b[key]));
    return direction * order || byName(a, b);
  });
}

// Tell the sidebar badge and the bell to recount right after an item changes.
const notifyChanged = async result => { window.dispatchEvent(new Event(ITEM_REVIEW_CHANGED)); return result; };
const addItem = item => createItem(item).then(notifyChanged);
const saveItem = (id, item) => updateItem(id, item).then(notifyChanged);
const removeItem = id => deleteItem(id).then(notifyChanged);

const rowClassName = item => (item.NeedsReview ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-50');

export default function ItemPoints() {
  return (
    <InfoPage
      title="Item"
      getData={getData}
      addData={addItem}
      updateData={saveItem}
      deleteData={removeItem}
      tableColumns={tableColumns}
      formFields={formFields}
      initialState={initialState}
      normalizeData={normalizeItem}
      toApiFormatData={toApiFormat}
      rowClassName={rowClassName}
    />
  );
}
