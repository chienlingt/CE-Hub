import React, { useState, useEffect } from 'react';
import { ShoppingCart, Package, User, CheckCircle, AlertCircle, Plus, Minus, X, Edit2, Save, Search } from 'lucide-react';
import ResultModal from '../common/ResultModal';
import { getAllProducts, getAllZones, addCustomer, addProduct, updateCustomer } from '../../services/informationService';

const REACT_APP_API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000';

const SERVICE_TYPES = [
  { value: 'delivery', label: 'Delivery Only' },
  { value: 'delivery_installation', label: 'Delivery + Installation' },
  // { value: 'stock_transfer', label: 'Stock Transfer to Outlet (Customer Pickup)' }
];

export default function PlaceOrder() {
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [zones, setZones] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [resultModal, setResultModal] = useState({
    open: false,
    type: null,
    title: '',
    message: ''
  });
  const [orderNumber, setOrderNumber] = useState(null);
  const [buildingInfo, setBuildingInfo] = useState(null);
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [specialEquipment, setSpecialEquipment] = useState(''); // Order-level equipment

  // Search states
  const [customerSearch, setCustomerSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');

  // Customer selection/creation/editing
  const [customerMode, setCustomerMode] = useState('select'); // 'select' or 'new'
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [customerEditData, setCustomerEditData] = useState(null);
  const [newCustomer, setNewCustomer] = useState({
    full_name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    postcode: '',
    state: ''
  });

  // Product management
  const [cart, setCart] = useState([]);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({
    product_name: '',
    package_length_cm: '',
    package_height_cm: '',
    package_width_cm: '',
    fragile_flag: false,
    installer_team_required_flag: false,
    estimated_installation_time_min: '',
    estimated_installation_time_max: '',
    dismantle_required_flag: false,
    needs_installation: false
  });

  const [isAddressValid, setIsAddressValid] = useState(true);
      const [addressError, setAddressError] = useState(null);
      const [formErrors, setFormErrors] = useState({});
  
      const validate = (customerData) => {
          const errors = {};
          if (!customerData.full_name) {
              errors.full_name = "Full name is required.";
          }
          if (!customerData.email) {
              errors.email = "Email is required.";
          } else if (!/\S+@\S+\.\S+/.test(customerData.email)) {
              errors.email = "Email is invalid.";
          }
          return errors;
      };
  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        const [productsData, zonesData, customersData, buildingsData] = await Promise.all([
          getAllProducts(),
          getAllZones(),
          fetch(`${REACT_APP_API_BASE_URL}/api/customers`).then(res => res.json()),
          fetch(`${REACT_APP_API_BASE_URL}/api/buildings`).then(res => res.json())
        ]);
        setProducts(Array.isArray(productsData) ? productsData : []);
        setZones(Array.isArray(zonesData) ? zonesData : []);
        setCustomers(Array.isArray(customersData) ? customersData : []);
        setBuildings(Array.isArray(buildingsData) ? buildingsData : []);
      } catch (error) {
        console.error('Error loading data:', error);
        setError('Failed to load data. Please refresh the page.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const validateAddress = async (address) => {
    if (!address) {
      setIsAddressValid(false);
      setAddressError('Address cannot be empty.');
      return false;
    }

    try {
      const response = await fetch(`${REACT_APP_API_BASE_URL}/api/customers/validate-address?address=${encodeURIComponent(address)}`);
      if (response.ok) {
        setIsAddressValid(true);
        setAddressError(null);
        return true;
      } else {
        const data = await response.json();
        setIsAddressValid(false);
        setAddressError(data.error || 'Invalid address.');
        return false;
      }
    } catch (error) {
      setIsAddressValid(false);
      setAddressError('Failed to validate address.');
      return false;
    }
  };


  const [isPhoneValid, setIsPhoneValid] = useState(true);
  const [phoneError, setPhoneError] = useState(null);

  const validatePhoneNumber = (phone) => {
    if (!phone) {
      setIsPhoneValid(true);
      setPhoneError(null);
      return;
    }

    const phoneRegex = /^\d{8,13}$/;
    if (phoneRegex.test(phone)) {
      setIsPhoneValid(true);
      setPhoneError(null);
    } else {
      setIsPhoneValid(false);
      setPhoneError('Phone number must be between 8 and 13 digits.');
    }
  };

  // Fetch building info when customer's address changes
  useEffect(() => {
    if (selectedCustomerId) {
      const customer = customers.find(c => c.id === selectedCustomerId);
      if (customer && customer.address) {
        // Try to find existing building based on address
        const building = buildings.find(b =>
          customer.address && b.building_name &&
          customer.address.toLowerCase().includes(b.building_name.toLowerCase())
        );
        setSelectedBuilding(building || null);

        // Set order-level special equipment from building
        if (building && building.special_equipment_needed) {
          setSpecialEquipment(building.special_equipment_needed);
        } else {
          setSpecialEquipment('');
        }
      }
    }
  }, [selectedCustomerId, customers, buildings]);

  // Filtered lists based on search
  const filteredCustomers = customers.filter(c =>
    c.full_name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.email?.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone?.includes(customerSearch)
  );

  const filteredProducts = products.filter(p =>
    p.product_name?.toLowerCase().includes(productSearch.toLowerCase()) && p.available_flag
  );

  // Add product to cart
  const addToCart = (product) => {
    const existingIndex = cart.findIndex(item => item.product.id === product.id);

    if (existingIndex >= 0) {
      const newCart = [...cart];
      newCart[existingIndex].quantity += 1;
      setCart(newCart);
    } else {
      setCart([...cart, {
        product,
        quantity: 1,
        serviceType: 'delivery',
        dismantleRequired: false,
        customInstallTime: null, // Will be stored per order item, not updating product
        customDismantleTime: null
      }]);
    }
  };

  // Update cart item quantity
  const updateCartQuantity = (index, delta) => {
    const newCart = [...cart];
    newCart[index].quantity = Math.max(1, newCart[index].quantity + delta);
    setCart(newCart);
  };

  // Update cart item service type
  const updateCartServiceType = (index, serviceType) => {
    const newCart = [...cart];
    newCart[index].serviceType = serviceType;

    // If changing to stock transfer, reset installation-related fields
    if (serviceType === 'stock_transfer') {
      newCart[index].customInstallTime = null;
    }

    setCart(newCart);
  };

  // Update cart item dismantle requirement
  const updateCartDismantle = (index, value) => {
    const newCart = [...cart];
    newCart[index].dismantleRequired = value;
    setCart(newCart);
  };

  // Update custom installation time (per order item, not product-wide)
  const updateCustomInstallTime = (index, minTime, maxTime) => {
    const newCart = [...cart];
    newCart[index].customInstallTime = {
      min: parseInt(minTime) || 0,
      max: parseInt(maxTime) || 0
    };
    setCart(newCart);
  };

  const updateCustomDismantleTime = (index, time) => {
    const newCart = [...cart];
    newCart[index].customDismantleTime = parseInt(time) || 0;
    setCart(newCart);
  };

  // Remove from cart
  const removeFromCart = (index) => {
    setCart(cart.filter((_, i) => i !== index));
  };
  
  // --- Form Reset Function ---
  const resetForm = () => {
    setCustomerMode('select');
    setSelectedCustomerId('');
    setEditingCustomer(false);
    setCustomerEditData(null);
    setNewCustomer({
      full_name: '', email: '', phone: '', address: '',
      city: '', postcode: '', state: ''
    });
    setCart([]);
    setShowAddProduct(false);
    setNewProduct({
      product_name: '', package_length_cm: '', package_height_cm: '', package_width_cm: '',
      fragile_flag: false, installer_team_required_flag: false,
      estimated_installation_time_min: '', estimated_installation_time_max: '',
      dismantle_required_flag: false, needs_installation: false
    });
    setCustomerSearch('');
    setProductSearch('');
    setSpecialEquipment('');
    setOrderNumber(null);
    setBuildingInfo(null);
    setSelectedBuilding(null);
    setIsAddressValid(true);
    setAddressError(null);
    setIsPhoneValid(true);
    setPhoneError(null);
    setError(null); // Clear any general errors
  };

  // Handle customer selection
  const handleSelectCustomer = async (customerId) => {
    setSelectedCustomerId(customerId);
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      setCustomerEditData({ ...customer });
      const isValid = await validateAddress(customer.address);
      if (!isValid) {
        setEditingCustomer(true);
      }
    }
  };

  // Start editing customer
  const startEditingCustomer = () => {
    const customer = customers.find(c => c.id === selectedCustomerId);
    if (customer) {
      setCustomerEditData({ ...customer });
      setEditingCustomer(true);
    }
  };

  // Save customer edits
  const saveCustomerEdits = async () => {
    try {
      await updateCustomer(selectedCustomerId, customerEditData);
      // Update local customers list
      setCustomers(customers.map(c =>
        c.id === selectedCustomerId ? { ...c, ...customerEditData } : c
      ));
      setEditingCustomer(false);
      setError(null);
    } catch (err) {
      console.error('Error updating customer:', err);
      setError('Failed to update customer. Please try again.');
    }
  };

  // Cancel customer edits
  const cancelCustomerEdits = () => {
    const customer = customers.find(c => c.id === selectedCustomerId);
    if (customer) {
      setCustomerEditData({ ...customer });
    }
    setEditingCustomer(false);
  };

      const handleNewCustomerChange = (e) => {
          const { name, value } = e.target;
          setNewCustomer(prev => {
              const newData = { ...prev, [name]: value };
              const errors = validate(newData);
              setFormErrors(errors);
              return newData;
          });
      };
  
      // Handle new customer creation
      const handleCreateCustomer = async () => {
          const errors = validate(newCustomer);
          if (Object.keys(errors).length > 0) {
              setFormErrors(errors);
              return;
          }
          try {
              const createdCustomer = await addCustomer(newCustomer);
              setCustomers([...customers, createdCustomer]);
              setSelectedCustomerId(createdCustomer.id);
              setCustomerEditData({ ...createdCustomer });
              setCustomerMode('select');
              setNewCustomer({
                  full_name: '',
                  email: '',
                  phone: '',
                  address: '',
                  city: '',
                  postcode: '',
                  state: ''
              });
              setFormErrors({});
          } catch (err) {
              console.error('Error creating customer:', err);
              setError('Failed to create customer. Please try again.');
          }
      };
  // Handle new product creation
  const handleCreateProduct = async () => {
    try {
      const productData = {
        ...newProduct,
        package_length_cm: parseInt(newProduct.package_length_cm) || null,
        package_height_cm: parseInt(newProduct.package_height_cm) || null,
        package_width_cm: parseInt(newProduct.package_width_cm) || null,
        estimated_installation_time_min: newProduct.needs_installation ? parseInt(newProduct.estimated_installation_time_min) || null : null,
        estimated_installation_time_max: newProduct.needs_installation ? parseInt(newProduct.estimated_installation_time_max) || null : null,
        installer_team_required_flag: newProduct.needs_installation ? newProduct.installer_team_required_flag : false,
      };

      const createdProduct = await addProduct(productData);
      setProducts([...products, createdProduct]);
      addToCart(createdProduct);
      setShowAddProduct(false);
      setNewProduct({
        product_name: '',
        package_length_cm: '',
        package_height_cm: '',
        package_width_cm: '',
        fragile_flag: false,
        installer_team_required_flag: false,
        estimated_installation_time_min: '',
        estimated_installation_time_max: '',
        dismantle_required_flag: false,
        needs_installation: false
      });
    } catch (err) {
      console.error('Error creating product:', err);
      setError('Failed to create product. Please try again.');
    }
  };

  // Submit order
  const handleSubmitOrder = async () => {
    setError(null);
    let errors = {};
    if (customerMode === 'new') {
        errors = validate(newCustomer);
    }

    // Validation
    if (customerMode === 'select' && !selectedCustomerId) {
      showResultModal({
        type: 'error',
        title: 'Select a customer',
        message: 'Please choose an existing customer before placing the order.'
      });
      return;
    }

    if (customerMode === 'new' && Object.keys(errors).length > 0) {
        setFormErrors(errors);
        showResultModal({
            type: 'error',
            title: 'Customer details incomplete',
            message: 'Please provide the customer name and email.'
          });
        return;
    }
    
    if (cart.length === 0) {
      showResultModal({
        type: 'error',
        title: 'Cart is empty',
        message: 'Cannot place order, cart cannot be empty.'
      });
      return;
    }

    // Installation time validation
    for (let i = 0; i < cart.length; i++) {
      const item = cart[i];
      if (item.serviceType === 'delivery_installation') {
        const hasProductInstallTime = item.product.estimated_installation_time_min && item.product.estimated_installation_time_max;
        const hasCustomInstallTime = item.customInstallTime && item.customInstallTime.min > 0 && item.customInstallTime.max > 0;

        if (!hasProductInstallTime && !hasCustomInstallTime) {
          showResultModal({
            type: 'error',
            title: 'Installation time required',
            message: `Product "${item.product.product_name}" requires installation but has no installation time. Please provide estimated installation time.`
          });
          return;
        }
      }
    }

    setSubmitting(true);
    setError(null);

    try {
      let customerForOrderPayload;

      // Determine the customer data to use for the order snapshot
      if (customerMode === 'new') {
        customerForOrderPayload = await addCustomer(newCustomer);
        setCustomers(prev => [...prev, customerForOrderPayload]);
        setSelectedCustomerId(customerForOrderPayload.id);
      } else {
        // Use the data from the edit form, which might be different from the master record
        customerForOrderPayload = customerEditData;
      }

      const response = await fetch(`${REACT_APP_API_BASE_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customer: {
            id: customerForOrderPayload.id,
            full_name: customerForOrderPayload.full_name,
            email: customerForOrderPayload.email,
            phone: customerForOrderPayload.phone,
            address: customerForOrderPayload.address || 'Address not specified',
            city: customerForOrderPayload.city || 'Kuala Lumpur',
            postcode: customerForOrderPayload.postcode || '50000',
            state: customerForOrderPayload.state || 'Selangor'
          },
          building: {
            housing_type: 'Residential',
            zone_id: zones.length > 0 ? zones[0].id : null
          },
          products: cart.map(item => ({
            product_id: item.product.id,
            quantity: item.quantity,
            dismantle_required: item.dismantleRequired,
            service_type: item.serviceType,
            custom_installation_time_min: item.customInstallTime?.min || null,
            custom_installation_time_max: item.customInstallTime?.max || null,
            custom_dismantle_time: item.customDismantleTime || null
          })),
          service_type: cart[0].serviceType,
          special_equipment_needed: specialEquipment || null
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create order');
      }

      const data = await response.json();
      setOrderNumber(data.order?.id);
      setBuildingInfo(data.buildingInfo);
      setResultModal({
        open: true,
        type: 'success',
        title: 'Order Placed Successfully!',
        message: 'Your order has been confirmed.'
      });
      resetForm();
    } catch (err) {
      console.error('Order submission error:', err);
      setResultModal({
        open: true,
        type: 'error',
        title: 'Order Not Placed',
        message: 'Failed to place order. Please try again.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const closeResultModal = () => {
    setResultModal({
      open: false,
      type: null,
      title: '',
      message: ''
    });
  };

  const showResultModal = ({ type = 'info', title, message }) => {
    setResultModal({
      open: true,
      type,
      title,
      message
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {resultModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-full w-full relative">
            <button
              onClick={closeResultModal}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="p-6 text-center">
              {resultModal.type === 'success' ? (
                <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-3" />
              ) : (
                <AlertCircle className="w-14 h-14 text-red-500 mx-auto mb-3" />
              )}
              <h2 className="text-xl font-bold text-gray-900 mb-2">{resultModal.title}</h2>
              <p className="text-gray-600 mb-4">{resultModal.message}</p>

              {resultModal.type === 'success' && (
                <>
                  <div className="bg-blue-50 rounded-lg p-4 mb-4 text-left">
                    <p className="text-sm text-gray-600">Order Number</p>
                    <p className="text-xl font-bold text-blue-600">{orderNumber}</p>
                  </div>
                  {buildingInfo && (
                    <div className="bg-green-50 rounded-lg p-4 mb-4 text-left">
                      <p className="text-sm text-gray-600">Building</p>
                      <p className="text-lg font-semibold text-green-700">{buildingInfo.buildingName}</p>
                      <p className="text-xs text-gray-600 mt-1">
                        {buildingInfo.isExisting ? 'Using existing building (shared access constraints)' : 'New building created'}
                      </p>
                      {(buildingInfo.accessTimeWindowStart || buildingInfo.accessTimeWindowEnd) && (
                        <p className="text-xs text-gray-600 mt-1">
                          Access window: {buildingInfo.accessTimeWindowStart || 'N/A'} - {buildingInfo.accessTimeWindowEnd || 'N/A'}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              {resultModal.type === 'error' && (
                <p className="text-xs text-gray-500 mb-4">
                  Please review the order details and try again.
                </p>
              )}

              <div className="space-y-2">
                {resultModal.type === 'success' ? (
                  <>
                    <button
                      onClick={() => {
                        resetForm(); 
                        closeResultModal();
                      }}
                      className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition-colors"
                    >
                      Place Another Order
                    </button>
                    <button
                      onClick={closeResultModal}
                      className="w-full border border-gray-200 text-gray-700 py-3 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Close
                    </button>
                  </>
                ) : (
                  <button
                    onClick={closeResultModal}
                    className="w-full bg-red-600 text-white py-3 rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Try Again
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="w-full">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start">
            <AlertCircle className="h-5 w-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-red-700">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <User className="h-5 w-5 mr-2 text-blue-600" />
              Customer
            </h2>

            <div className="flex space-x-2 mb-4">
              <button
                onClick={() => {
                  setCustomerMode('select');
                  setEditingCustomer(false);
                }}
                className={`flex-1 py-2 px-4 rounded-lg transition-colors ${
                  customerMode === 'select'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Select Existing
              </button>
              <button
                onClick={() => {
                  setCustomerMode('new');
                  setEditingCustomer(false);
                  setSelectedCustomerId('');
                }}
                className={`flex-1 py-2 px-4 rounded-lg transition-colors ${
                  customerMode === 'new'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Create New
              </button>
            </div>

            {customerMode === 'select' ? (
              <>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by name, email, or phone..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>

                <select
                  value={selectedCustomerId}
                  onChange={(e) => handleSelectCustomer(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-3"
                  size="5"
                >
                  <option value="">-- Select a customer --</option>
                  {filteredCustomers.map(customer => (
                    <option key={customer.id} value={customer.id}>
                      {customer.full_name} ({customer.email})
                    </option>
                  ))}
                </select>

                {selectedCustomer && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="text-sm font-semibold text-gray-700">Customer Details</h3>
                      {!editingCustomer ? (
                        <button
                          onClick={startEditingCustomer}
                          className="text-blue-600 hover:text-blue-700 flex items-center text-sm"
                        >
                          <Edit2 className="h-4 w-4 mr-1" />
                          Edit
                        </button>
                      ) : (
                        <div className="flex space-x-2">
                          <button
                            onClick={saveCustomerEdits}
                            disabled={!isAddressValid || !isPhoneValid}
                            className="text-green-600 hover:text-green-700 flex items-center text-sm"
                          >
                            <Save className="h-4 w-4 mr-1" />
                            Save
                          </button>
                          <button
                            onClick={cancelCustomerEdits}
                            className="text-gray-600 hover:text-gray-700 flex items-center text-sm"
                          >
                            <X className="h-4 w-4 mr-1" />
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>

                    {editingCustomer ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={customerEditData.full_name || ''}
                          onChange={(e) => setCustomerEditData({ ...customerEditData, full_name: e.target.value })}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                          placeholder="Full Name"
                        />
                        <input
                          type="email"
                          value={customerEditData.email || ''}
                          onChange={(e) => setCustomerEditData({ ...customerEditData, email: e.target.value })}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                          placeholder="Email"
                        />
                        <input
                          type="tel"
                          value={customerEditData.phone || ''}
                          onChange={(e) => setCustomerEditData({ ...customerEditData, phone: e.target.value })}
                          onBlur={(e) => validatePhoneNumber(e.target.value)}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                          placeholder="Phone"
                        />
                        {phoneError && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 my-2 text-sm text-red-700">
                                {phoneError}
                            </div>
                        )}
                        <input
                          type="text"
                          value={customerEditData.address || ''}
                          onChange={(e) => setCustomerEditData({ ...customerEditData, address: e.target.value })}
                          onBlur={(e) => validateAddress(e.target.value)}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                          placeholder="Address"
                        />
                        {addressError && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3 my-2 text-sm text-red-700">
                            {addressError}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={customerEditData.city || ''}
                            onChange={(e) => setCustomerEditData({ ...customerEditData, city: e.target.value })}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                            placeholder="City"
                          />
                          <input
                            type="text"
                            value={customerEditData.postcode || ''}
                            onChange={(e) => setCustomerEditData({ ...customerEditData, postcode: e.target.value })}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                            placeholder="Postcode"
                          />
                        </div>
                        <input
                          type="text"
                          value={customerEditData.state || ''}
                          onChange={(e) => setCustomerEditData({ ...customerEditData, state: e.target.value })}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                          placeholder="State"
                        />
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-sm text-gray-600"><strong>Name:</strong> {selectedCustomer.full_name}</p>
                        <p className="text-sm text-gray-600"><strong>Email:</strong> {selectedCustomer.email}</p>
                        <p className="text-sm text-gray-600"><strong>Phone:</strong> {selectedCustomer.phone || 'N/A'}</p>
                        <p className="text-sm text-gray-600"><strong>Address:</strong> {selectedCustomer.address || 'N/A'}</p>
                        <p className="text-sm text-gray-600"><strong>City:</strong> {selectedCustomer.city || 'N/A'}</p>
                        <p className="text-sm text-gray-600"><strong>Postcode:</strong> {selectedCustomer.postcode || 'N/A'}</p>
                        <p className="text-sm text-gray-600"><strong>State:</strong> {selectedCustomer.state || 'N/A'}</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Full Name *"
                  name="full_name"
                  value={newCustomer.full_name}
                  onChange={handleNewCustomerChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {formErrors.full_name && <p className="text-xs text-red-500">{formErrors.full_name}</p>}
                <input
                  type="email"
                  placeholder="Email *"
                  name="email"
                  value={newCustomer.email}
                  onChange={handleNewCustomerChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {formErrors.email && <p className="text-xs text-red-500">{formErrors.email}</p>}
                <input
                  type="tel"
                  placeholder="Phone"
                  name="phone"
                  value={newCustomer.phone}
                  onChange={handleNewCustomerChange}
                  onBlur={(e) => validatePhoneNumber(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {phoneError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 my-2 text-sm text-red-700">
                        {phoneError}
                    </div>
                )}
                <input
                  type="text"
                  placeholder="Address"
                  name="address"
                  value={newCustomer.address}
                  onChange={handleNewCustomerChange}
                  onBlur={(e) => validateAddress(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {addressError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 my-2 text-sm text-red-700">
                    {addressError}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="City"
                    name="city"
                    value={newCustomer.city}
                    onChange={handleNewCustomerChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <input
                    type="text"
                    placeholder="Postcode"
                    name="postcode"
                    value={newCustomer.postcode}
                    onChange={handleNewCustomerChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <input
                  type="text"
                  placeholder="State"
                  name="state"
                  value={newCustomer.state}
                  onChange={handleNewCustomerChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={handleCreateCustomer}
                  disabled={Object.keys(formErrors).length > 0 || !isAddressValid || !isPhoneValid}
                  className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Create Customer
                </button>
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center justify-between"><span className="flex items-center"><Package className="h-5 w-5 mr-2 text-blue-600" />Products</span><button onClick={() => setShowAddProduct(!showAddProduct)} className="text-sm text-blue-600 hover:text-blue-700 flex items-center"><Plus className="h-4 w-4 mr-1" />Add New</button></h2>
            {showAddProduct && (<div className="mb-4 p-4 bg-blue-50 rounded-lg space-y-3"><h3 className="text-sm font-semibold text-gray-700 mb-2">New Product</h3><input type="text" placeholder="Product Name *" value={newProduct.product_name} onChange={(e) => setNewProduct({ ...newProduct, product_name: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"/><div className="grid grid-cols-3 gap-2"><input type="number" placeholder="L (cm)" value={newProduct.package_length_cm} onChange={(e) => setNewProduct({ ...newProduct, package_length_cm: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"/><input type="number" placeholder="W (cm)" value={newProduct.package_width_cm} onChange={(e) => setNewProduct({ ...newProduct, package_width_cm: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"/><input type="number" placeholder="H (cm)" value={newProduct.package_height_cm} onChange={(e) => setNewProduct({ ...newProduct, package_height_cm: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"/></div><div className="space-y-2"><div className="grid grid-cols-2 gap-2"><div><label className="block text-sm font-medium text-gray-700">Fragile</label><select value={newProduct.fragile_flag} onChange={(e) => setNewProduct({ ...newProduct, fragile_flag: e.target.value === 'true' })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"><option value="false">No</option><option value="true">Yes</option></select></div><div><label className="block text-sm font-medium text-gray-700">Requires Dismantling</label><select value={newProduct.dismantle_required_flag} onChange={(e) => setNewProduct({ ...newProduct, dismantle_required_flag: e.target.value === 'true' })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"><option value="false">No</option><option value="true">Yes</option></select></div></div><div><label className="block text-sm font-medium text-gray-700">Need installation</label><select value={newProduct.needs_installation} onChange={(e) => setNewProduct({ ...newProduct, needs_installation: e.target.value === 'true' })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"><option value="false">No</option><option value="true">Yes</option></select></div>{newProduct.needs_installation && (<><div><label className="block text-sm font-medium text-gray-700">Need installer</label><select value={newProduct.installer_team_required_flag} onChange={(e) => setNewProduct({ ...newProduct, installer_team_required_flag: e.target.value === 'true' })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"><option value="false">No</option><option value="true">Yes</option></select></div><div className="grid grid-cols-2 gap-2"><input type="number" placeholder="Min Time (min)" value={newProduct.estimated_installation_time_min} onChange={(e) => setNewProduct({ ...newProduct, estimated_installation_time_min: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"/><input type="number" placeholder="Max Time (min)" value={newProduct.estimated_installation_time_max} onChange={(e) => setNewProduct({ ...newProduct, estimated_installation_time_max: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"/></div></>)}</div><div className="flex space-x-2"><button onClick={handleCreateProduct} disabled={!newProduct.product_name} className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed text-sm">Create & Add</button><button onClick={() => setShowAddProduct(false)} className="px-4 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition-colors text-sm">Cancel</button></div></div>)}
            <div className="relative mb-3"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" /><input type="text" placeholder="Search products..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"/></div>
            <div className="space-y-2 max-h-80 overflow-y-auto">{filteredProducts.map(product => (<div key={product.id} className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => addToCart(product)}><div className="flex justify-between items-start"><div className="flex-1"><p className="font-medium text-gray-900 text-sm">{product.product_name}</p></div><Plus className="h-5 w-5 text-blue-600 flex-shrink-0" /></div></div>))}</div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center"><ShoppingCart className="h-5 w-5 mr-2 text-blue-600" />Selected Products ({cart.length} item{cart.length !== 1 ? 's' : ''})</h2>
          {cart.length === 0 ? (<div className="text-center py-12 text-gray-500"><ShoppingCart className="h-16 w-16 mx-auto mb-4 text-gray-300" /><p>No products selected</p><p className="text-sm">Add products from the section above</p></div>) : (<><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">{cart.map((item, index) => (<div key={index} className="border border-gray-200 rounded-lg p-4"><div className="flex justify-between items-start mb-3"><div className="flex-1"><h3 className="font-semibold text-gray-900 text-sm">{item.product.product_name}</h3></div><button onClick={() => removeFromCart(index)} className="text-red-500 hover:text-red-700"><X className="h-4 w-4" /></button></div><div className="flex items-center space-x-2 mb-3"><span className="text-xs font-medium text-gray-700">Qty:</span><button onClick={() => updateCartQuantity(index, -1)} className="p-1 rounded bg-gray-200 hover:bg-gray-300"><Minus className="h-3 w-3" /></button><span className="w-8 text-center font-semibold text-sm">{item.quantity}</span><button onClick={() => updateCartQuantity(index, 1)} className="p-1 rounded bg-gray-200 hover:bg-gray-300"><Plus className="h-3 w-3" /></button></div><div className="mb-3"><label className="block text-xs font-medium text-gray-700 mb-2">Service Type:</label><div className="space-y-1">{SERVICE_TYPES.map(type => (<label key={type.value} className="flex items-center text-xs"><input type="radio" name={`serviceType-${index}`} value={type.value} checked={item.serviceType === type.value} onChange={(e) => updateCartServiceType(index, e.target.value)} className="mr-2"/><span className="text-gray-700">{type.label}</span></label>))}</div></div>{item.serviceType !== 'stock_transfer' && item.product.dismantle_required_flag && (<div className="mb-3"><label className="flex items-center text-xs text-gray-700"><input type="checkbox" checked={item.dismantleRequired} onChange={(e) => updateCartDismantle(index, e.target.checked)} className="mr-2"/>Dismantling Required</label>{item.dismantleRequired && (<div className="mt-2"><label className="block text-xs font-medium text-gray-700 mb-1">Custom Dismantle Time (min)</label><input type="number" placeholder="Dismantle Time" value={item.customDismantleTime || ''} onChange={(e) => updateCustomDismantleTime(index, e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 text-xs"/><p className="text-xs text-gray-600">(Product default: {item.product.dismantle_time || 'N/A'} min)</p></div>)}</div>)}{item.serviceType === 'delivery_installation' && (<div className="bg-blue-50 rounded-lg p-2 mt-2"><p className="text-xs font-medium text-gray-700 mb-1">Installation Time:</p>{item.customInstallTime ? (<div className="space-y-2"><div className="grid grid-cols-2 gap-2"><input type="number" placeholder="Min (min)" value={item.customInstallTime.min || ''} onChange={(e) => updateCustomInstallTime(index, e.target.value, item.customInstallTime?.max || '')} className="w-full border border-gray-300 rounded px-2 py-1 text-xs"/><input type="number" placeholder="Max (min)" value={item.customInstallTime.max || ''} onChange={(e) => updateCustomInstallTime(index, item.customInstallTime?.min || '', e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 text-xs"/></div><p className="text-xs text-gray-600">(Product default: {item.product.estimated_installation_time_min || 'N/A'} - {item.product.estimated_installation_time_max || 'N/A'} min)</p></div>) : (item.product.estimated_installation_time_min && item.product.estimated_installation_time_max ? (<div className="space-y-2"><p className="text-xs text-gray-600">{item.product.estimated_installation_time_min} - {item.product.estimated_installation_time_max} minutes</p><button onClick={() => updateCustomInstallTime(index, item.product.estimated_installation_time_min, item.product.estimated_installation_time_max)} className="text-xs text-blue-600 hover:text-blue-700 flex items-center"><Edit2 className="h-3 w-3 mr-1" />Edit for this order</button></div>) : (<div className="space-y-2"><p className="text-xs text-orange-600 mb-1">No time set. Provide estimate:</p><div className="grid grid-cols-2 gap-2"><input type="number" placeholder="Min (min)" value={item.customInstallTime?.min || ''} onChange={(e) => updateCustomInstallTime(index, e.target.value, item.customInstallTime?.max || '')} className="w-full border border-gray-300 rounded px-2 py-1 text-xs"/><input type="number" placeholder="Max (min)" value={item.customInstallTime?.max || ''} onChange={(e) => updateCustomInstallTime(index, item.customInstallTime?.min || '', e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 text-xs"/></div></div>))}</div>)}</div>))}</div><div className="border-t border-gray-200 pt-4 mb-4"><label className="block text-sm font-medium text-gray-700 mb-2">Special Equipment Needed (for entire order):</label><textarea value={specialEquipment} onChange={(e) => setSpecialEquipment(e.target.value)} placeholder={selectedBuilding ? `Building default: ${selectedBuilding.special_equipment_needed || 'None'}` : 'Enter special equipment needed...'} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" rows="3"/>{selectedBuilding && selectedBuilding.special_equipment_needed && (<p className="text-xs text-gray-500 mt-1">Building default: {selectedBuilding.special_equipment_needed}</p>)}{selectedBuilding && (<p className="text-xs text-gray-500 mt-1">Access window: {selectedBuilding.access_time_window_start || 'N/A'} - {selectedBuilding.access_time_window_end || 'N/A'}</p>)}</div>
              <div className="border-t border-gray-200 pt-4"><button onClick={handleSubmitOrder} disabled={submitting || (customerMode === 'select' && !selectedCustomerId) || (customerMode === 'new' && Object.keys(formErrors).length > 0) || cart.length === 0} className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center text-lg font-semibold">{submitting ? (<><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>Placing Order...</>) : (<><CheckCircle className="h-5 w-5 mr-2" />Place Order</>)}</button></div></>)}
        </div>
      </div>
    </div>
  );
}